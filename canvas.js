/**
 * canvas.js
 * Visual SVG canvas engine for drawing, dragging, and connecting block diagram components.
 */

/**
 * A wire may only connect an output port to an input port (in either drag
 * direction), and never a port to itself / the same node. This is the single
 * rule that governs both port-to-port wiring and take-off branches dragged off
 * an existing wire (which always carry an output signal).
 */
export function isValidPortConnection(startNode, startPortType, targetNode, targetPortType) {
    if (!targetNode || targetNode === startNode) return false;
    return (
        (startPortType === 'out' && targetPortType === 'in') ||
        (startPortType === 'in' && targetPortType === 'out')
    );
}

/** Convert a screen pixel (relative to the svg's bounding rect) into world coords. */
export function screenToWorld(clientX, clientY, rect, vb) {
  return {
    x: vb.x + (clientX - rect.left) / rect.width * vb.w,
    y: vb.y + (clientY - rect.top) / rect.height * vb.h,
  };
}

/** New viewBox after scaling by `factor` while keeping world point `pt` fixed.
 *  factor < 1 zooms in (smaller viewBox), > 1 zooms out. Aspect ratio preserved.
 *  clamp = { minW, maxW } bounds the viewBox width. */
export function zoomAroundPoint(vb, pt, factor, clamp = {}) {
  const aspect = vb.h / vb.w;
  let w = vb.w * factor;
  if (clamp.minW != null) w = Math.max(clamp.minW, w);
  if (clamp.maxW != null) w = Math.min(clamp.maxW, w);
  const h = w * aspect;
  const rx = (pt.x - vb.x) / vb.w;
  const ry = (pt.y - vb.y) / vb.h;
  return { x: pt.x - rx * w, y: pt.y - ry * h, w, h };
}

/** Smallest viewBox enclosing all node centres plus `padding`; null if no nodes. */
export function fitBox(nodes, padding = 60) {
  if (!nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  return { x: minX - padding, y: minY - padding, w: (maxX - minX) + 2 * padding, h: (maxY - minY) + 2 * padding };
}

export class BlockDiagramCanvas {
    constructor(svgElement, onStateChange = () => {}) {
        this.svg = svgElement;
        this.onStateChange = onStateChange;

        this.nodes = [];
        this.connections = [];

        this.selectedElement = null;
        this.draggedNode = null;
        this.draggedConnection = null;
        this.activeWire = null; // Temporary wire during dragging
        this.wireTapCandidate = null; // Pending take-off branch from a grabbed wire
        this.viewBox = null; // {x,y,w,h} in world units; lazily initialised from the svg size
        this.panning = null; // active background pan: {startClientX, startClientY, startVb}

        this.dragOffset = { x: 0, y: 0 };
        this.nextId = 1;

        // Background blueprint template watermark tracking
        this.blueprintImgData = null;
        this.blueprintOpacity = 0.25;

        this.initEvents();
        this.render();
    }

    generateId(prefix) {
        return `${prefix}_${this.nextId++}`;
    }

    clear() {
        this.nodes = [];
        this.connections = [];
        this.selectedElement = null;
        this.draggedNode = null;
        this.activeWire = null;
        this.render();
        this.onStateChange();
    }

    addNode(type, x, y, value = "1", label = "") {
        const id = this.generateId(type);
        const node = {
            id,
            type,
            x: x || 150,
            y: y || 150,
            value: value,
            label: label || id.toUpperCase()
        };

        if (type === 'input') {
            node.label = label || "R";
            node.value = "1";
        } else if (type === 'output') {
            node.label = label || "Y";
            node.value = "1";
        } else if (type === 'sum') {
            node.label = label || "Σ";
            node.value = "";
        } else if (type === 'disturbance') {
            node.label = label || "D";
            node.value = "1";
        }

        this.nodes.push(node);
        this.render();
        this.onStateChange();
        return node;
    }

    deleteSelected() {
        if (!this.selectedElement) return;

        if (this.selectedElement.type === 'connection') {
            const connId = this.selectedElement.id;
            this.deleteConnectionCascade(connId);
        } else {
            const nodeId = this.selectedElement.id;
            this.nodes = this.nodes.filter(n => n.id !== nodeId);
            
            // Find connections to delete
            const toDelete = this.connections.filter(c => c.fromNode === nodeId || c.toNode === nodeId);
            toDelete.forEach(c => this.deleteConnectionCascade(c.id));
        }

        this.selectedElement = null;
        this.render();
        this.onStateChange();
    }

    deleteConnectionCascade(connId) {
        this.connections = this.connections.filter(c => c.id !== connId);
        // Find any branches tapped from this wire and delete them too cascade-style
        const branches = this.connections.filter(c => c.tapConnId === connId);
        branches.forEach(b => this.deleteConnectionCascade(b.id));
    }

    initEvents() {
        this.svg.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.svg.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.svg.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.svg.addEventListener('mouseleave', () => { if (this.panning) { this.panning = null; } });
        this.svg.addEventListener('dblclick', (e) => this.onDblClick(e));
        this.svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        window.addEventListener('resize', () => this.onResize());

        // Key listener for deleting selected components and rotating
        window.addEventListener('keydown', (e) => {
            if (!this.isEditingText()) {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    this.deleteSelected();
                } else if (e.key.toLowerCase() === 'r') {
                    this.rotateSelected();
                } else if (e.key === 'Escape') {
                    if (this.activeWire) {
                        this.activeWire = null;
                        this.render();
                    } else if (this.selectedElement) {
                        this.selectedElement = null;
                        this.render();
                        this.onStateChange();
                    }
                }
            }
        });
    }

    isEditingText() {
        const active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    }

    onDblClick(e) {
        const target = e.target;
        const nodeGroup = target.closest('.node-group');
        if (nodeGroup) {
            const nodeId = nodeGroup.getAttribute('data-id');
            const node = this.nodes.find(n => n.id === nodeId);
            if (node) {
                if (node.type === 'sum') {
                    const newLabel = prompt("Enter Summing Junction Label:", node.label);
                    if (newLabel !== null) {
                        this.updateNodeLabel(nodeId, newLabel);
                    }
                } else if (node.type === 'input' || node.type === 'output') {
                    const newLabel = prompt("Enter Node Label:", node.label);
                    if (newLabel !== null) {
                        this.updateNodeLabel(nodeId, newLabel);
                    }
                } else if (node.type === 'block') {
                    const newLabel = prompt("Enter Block Label (e.g. G1):", node.label);
                    if (newLabel !== null) {
                        this.updateNodeLabel(nodeId, newLabel);
                        
                        // Prompt for value too
                        const newVal = prompt(`Enter Transfer Function for ${newLabel} (e.g. 10/(s^2+2s)):`, node.value);
                        if (newVal !== null) {
                            this.updateNodeValue(nodeId, newVal);
                        }
                    }
                }
            }
        }
    }

    rotateSelected() {
        if (!this.selectedElement || this.selectedElement.type !== 'node') return;
        const node = this.nodes.find(n => n.id === this.selectedElement.id);
        if (node) {
            const directions = ['right', 'down', 'left', 'up'];
            const currentDir = node.direction || 'right';
            const nextIdx = (directions.indexOf(currentDir) + 1) % directions.length;
            node.direction = directions[nextIdx];
            
            this.render();
            this.onStateChange();
        }
    }

    ensureViewBox() {
        if (this.viewBox) return;
        const r = this.svg.getBoundingClientRect();
        this.viewBox = { x: 0, y: 0, w: r.width || 800, h: r.height || 600 };
    }

    onResize() {
        if (!this.viewBox) return;
        const r = this.svg.getBoundingClientRect();
        if (!r.width || !r.height) return;
        // keep the world width, re-derive height from the new aspect so the
        // viewBox aspect matches the element (no letterboxing / click drift)
        this.viewBox = { ...this.viewBox, h: this.viewBox.w * (r.height / r.width) };
        this.render();
    }

    getMouseCoords(e) {
        this.ensureViewBox();
        const rect = this.svg.getBoundingClientRect();
        return screenToWorld(e.clientX, e.clientY, rect, this.viewBox);
    }

    onWheel(e) {
        e.preventDefault();
        this.ensureViewBox();
        const rect = this.svg.getBoundingClientRect();
        const pt = screenToWorld(e.clientX, e.clientY, rect, this.viewBox);
        const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1; // down = zoom out
        const baseW = rect.width || 800;
        this.viewBox = zoomAroundPoint(this.viewBox, pt, factor, { minW: baseW / 8, maxW: baseW * 10 });
        this.render();
    }

    zoomAtCenter(factor) {
        this.ensureViewBox();
        const rect = this.svg.getBoundingClientRect();
        const baseW = rect.width || 800;
        const center = { x: this.viewBox.x + this.viewBox.w / 2, y: this.viewBox.y + this.viewBox.h / 2 };
        this.viewBox = zoomAroundPoint(this.viewBox, center, factor, { minW: baseW / 8, maxW: baseW * 10 });
        this.render();
    }
    zoomIn() { this.zoomAtCenter(1 / 1.2); }
    zoomOut() { this.zoomAtCenter(1.2); }
    resetView() {
        const r = this.svg.getBoundingClientRect();
        this.viewBox = { x: 0, y: 0, w: r.width || 800, h: r.height || 600 };
        this.render();
    }
    fitView() {
        const box = fitBox(this.nodes, 80);
        if (!box) { this.resetView(); return; }
        const r = this.svg.getBoundingClientRect();
        const aspect = (r.height || 600) / (r.width || 800);
        let w = box.w, h = box.h;
        if (h / w < aspect) h = w * aspect; else w = h / aspect;
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        this.viewBox = { x: cx - w / 2, y: cy - h / 2, w, h };
        this.render();
    }

    onMouseDown(e) {
        const coords = this.getMouseCoords(e);
        const target = e.target;

        // 1. Check if clicked a port to start drawing connection
        if (target.classList.contains('port')) {
            e.preventDefault();
            const nodeId = target.getAttribute('data-node');
            const portType = target.getAttribute('data-port-type'); // 'in' or 'out'

            this.activeWire = {
                fromNode: nodeId,
                startNode: nodeId,
                startPortType: portType,
                fromPortCoords: {
                    x: parseFloat(target.getAttribute('cx')),
                    y: parseFloat(target.getAttribute('cy')),
                },
                currentCoords: coords,
                tapConnId: target.getAttribute('data-tap-conn-id') || undefined,
                tapSegmentIndex: target.getAttribute('data-tap-segment') ? parseInt(target.getAttribute('data-tap-segment')) : undefined,
                tapRatio: target.getAttribute('data-tap-ratio') ? parseFloat(target.getAttribute('data-tap-ratio')) : undefined
            };
            return;
        }

        // 2. Clicked a wire.
        //    - Shift+drag  -> pull a new take-off branch, anchored at the grab point.
        //    - plain drag  -> move/reshape the wire.
        //    - plain click -> select it (for delete).
        const connPath = target.closest('.connection-line');
        if (connPath) {
            e.preventDefault();
            const connId = connPath.getAttribute('data-id');
            const conn = this.connections.find(c => c.id === connId);
            if (conn) {
                if (e.shiftKey) {
                    const near = this.getNearestPointOnConnection(conn, coords);
                    this.wireTapCandidate = {
                        connId,
                        fromNode: conn.fromNode,
                        segmentIndex: near.segmentIndex,
                        ratio: near.ratio,
                        startCoords: { x: near.x, y: near.y },
                        downCoords: coords,
                    };
                } else {
                    this.draggedConnection = conn;
                    this.selectedElement = { type: 'connection', id: connId };
                    this.render();
                    this.onStateChange();
                }
            }
            return;
        }

        // Toggle connection sign on summing junctions (inside the circle)
        if (target.classList.contains('sum-junction-sign')) {
            e.preventDefault();
            const connId = target.getAttribute('data-conn-id');
            const conn = this.connections.find(c => c.id === connId);
            if (conn) {
                conn.sign = conn.sign === '+' ? '-' : '+';
                this.render();
                this.onStateChange();
            }
            return;
        }

        // Double click/toggle connection sign on summing junctions
        const connLabel = target.closest('.connection-sign-btn');
        if (connLabel) {
            const connId = connLabel.getAttribute('data-id');
            const conn = this.connections.find(c => c.id === connId);
            if (conn) {
                conn.sign = conn.sign === '+' ? '-' : '+';
                this.render();
                this.onStateChange();
            }
            return;
        }

        // 3. Check if clicked a node
        const nodeGroup = target.closest('.node-group');
        if (nodeGroup) {
            e.preventDefault();
            const nodeId = nodeGroup.getAttribute('data-id');
            const node = this.nodes.find(n => n.id === nodeId);
            
            this.draggedNode = node;
            this.dragOffset = {
                x: coords.x - node.x,
                y: coords.y - node.y
            };
            this.selectedElement = { type: 'node', id: nodeId };
            
            // Bring dragged node to front of SVG list
            this.nodes = this.nodes.filter(n => n.id !== nodeId);
            this.nodes.push(node);
            
            this.render();
            this.onStateChange();
            return;
        }

        // 4. Clicked blank canvas — deselect and begin panning
        this.selectedElement = null;
        this.ensureViewBox();
        this.panning = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startVb: { ...this.viewBox },
        };
        this.render();
        this.onStateChange();
    }

    onMouseMove(e) {
        if (this.panning) {
            const rect = this.svg.getBoundingClientRect();
            const dxWorld = (e.clientX - this.panning.startClientX) / rect.width * this.panning.startVb.w;
            const dyWorld = (e.clientY - this.panning.startClientY) / rect.height * this.panning.startVb.h;
            this.viewBox = {
                x: this.panning.startVb.x - dxWorld,
                y: this.panning.startVb.y - dyWorld,
                w: this.panning.startVb.w,
                h: this.panning.startVb.h,
            };
            this.render();
            return;
        }
        const coords = this.getMouseCoords(e);

        // Handle active node dragging
        if (this.draggedNode) {
            // Keep on SVG bounds
            this.draggedNode.x = Math.max(-100000, Math.min(100000, coords.x - this.dragOffset.x));
            this.draggedNode.y = Math.max(-100000, Math.min(100000, coords.y - this.dragOffset.y));
            
            // Reset custom waypoints of connected lines to avoid weird stretching
            this.connections.forEach(c => {
                if (c.fromNode === this.draggedNode.id || c.toNode === this.draggedNode.id) {
                    delete c.midX;
                    delete c.midY;
                }
            });
            
            this.render();
            this.onStateChange();
        }

        // Promote a wire-tap candidate into a live branch once the user drags.
        if (this.wireTapCandidate && !this.activeWire) {
            const c = this.wireTapCandidate;
            if (Math.hypot(coords.x - c.downCoords.x, coords.y - c.downCoords.y) > 6) {
                this.activeWire = {
                    fromNode: c.fromNode,
                    startNode: c.fromNode,
                    startPortType: 'out',
                    fromPortCoords: c.startCoords,
                    currentCoords: coords,
                    tapConnId: c.connId,
                    tapSegmentIndex: c.segmentIndex,
                    tapRatio: c.ratio,
                };
                this.wireTapCandidate = null;
            }
        }

        // Handle connection wire drawing
        if (this.activeWire) {
            this.activeWire.currentCoords = coords;
            this.render();
        }

        // Handle connection line dragging (moving the bend/waypoint)
        if (this.draggedConnection) {
            const startNode = this.nodes.find(n => n.id === this.draggedConnection.fromNode);
            const endNode = this.nodes.find(n => n.id === this.draggedConnection.toNode);
            
            if (startNode && endNode) {
                let start = this.getPortCoords(this.draggedConnection.fromNode, 'out');
                if (this.draggedConnection.tapConnId) {
                    const parentConn = this.connections.find(c => c.id === this.draggedConnection.tapConnId);
                    if (parentConn) {
                        const points = this.getConnectionPoints(parentConn);
                        if (points.length > 0) {
                            const i = Math.min(this.draggedConnection.tapSegmentIndex, points.length - 2);
                            const p1 = points[i];
                            const p2 = points[i + 1];
                            if (p1 && p2) {
                                start = {
                                    x: p1.x + (p2.x - p1.x) * this.draggedConnection.tapRatio,
                                    y: p1.y + (p2.y - p1.y) * this.draggedConnection.tapRatio
                                };
                            }
                        }
                    }
                }
                let end = this.getPortCoords(this.draggedConnection.toNode, 'in');
                
                if (endNode.type === 'sum') {
                    const dir = endNode.direction || 'right';
                    let candidatePorts = [];
                    if (dir === 'right') {
                        candidatePorts = [{ x: endNode.x - 25, y: endNode.y }, { x: endNode.x, y: endNode.y - 25 }, { x: endNode.x, y: endNode.y + 25 }];
                    } else if (dir === 'left') {
                        candidatePorts = [{ x: endNode.x + 25, y: endNode.y }, { x: endNode.x, y: endNode.y - 25 }, { x: endNode.x, y: endNode.y + 25 }];
                    } else if (dir === 'up') {
                        candidatePorts = [{ x: endNode.x - 25, y: endNode.y }, { x: endNode.x + 25, y: endNode.y }, { x: endNode.x, y: endNode.y + 25 }];
                    } else if (dir === 'down') {
                        candidatePorts = [{ x: endNode.x - 25, y: endNode.y }, { x: endNode.x + 25, y: endNode.y }, { x: endNode.x, y: endNode.y - 25 }];
                    }
                    
                    let minDistance = Infinity;
                    let closestPort = candidatePorts[0];
                    candidatePorts.forEach(p => {
                        const dist = Math.hypot(start.x - p.x, start.y - p.y);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestPort = p;
                        }
                    });
                    end = closestPort;
                }

                // Determine whether to update midX or midY
                if (this.draggedConnection.midX !== undefined) {
                    this.draggedConnection.midX = coords.x;
                } else if (this.draggedConnection.midY !== undefined) {
                    this.draggedConnection.midY = coords.y;
                } else {
                    // Decide based on default routing
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const startDir = startNode.direction || 'right';
                    const endDir = endNode.direction || 'right';
                    
                    let preferY = false;
                    if (Math.abs(dy) < 8) {
                        preferY = true;
                    } else if (start.x > end.x && startDir === 'right' && endDir === 'right') {
                        preferY = true;
                    } else if (Math.abs(dx) <= 30) {
                        preferY = true;
                    }
                    
                    if (preferY) {
                        this.draggedConnection.midY = coords.y;
                    } else {
                        this.draggedConnection.midX = coords.x;
                    }
                }
                
                this.render();
                this.onStateChange();
            }
        }
    }

    onMouseUp(e) {
        if (this.panning) { this.panning = null; return; }
        // A wire-tap candidate that never turned into a drag = a plain click:
        // select the wire (so it can be deleted), don't branch.
        if (this.wireTapCandidate && !this.activeWire) {
            this.selectedElement = { type: 'connection', id: this.wireTapCandidate.connId };
            this.wireTapCandidate = null;
            this.render();
            this.onStateChange();
            return;
        }
        this.wireTapCandidate = null;

        // Complete wire connection
        if (this.activeWire) {
            const target = e.target;
            if (target.classList.contains('port')) {
                const targetNodeId = target.getAttribute('data-node');
                const targetPortType = target.getAttribute('data-port-type');

                // Only connect output->input (or input->output) between two
                // different nodes. Branches dragged off a wire carry an output
                // signal, so they too are rejected unless dropped on an input.
                if (isValidPortConnection(
                        this.activeWire.startNode, this.activeWire.startPortType,
                        targetNodeId, targetPortType)) {
                    
                    const fromNodeId = this.activeWire.startPortType === 'out' ? this.activeWire.startNode : targetNodeId;
                    const toNodeId = this.activeWire.startPortType === 'in' ? this.activeWire.startNode : targetNodeId;
                    
                    const targetNode = this.nodes.find(n => n.id === toNodeId);
                    
                    // Sum nodes allow multiple inputs, others only allow 1 input connection
                    const existingInConnections = this.connections.filter(c => c.toNode === toNodeId);
                    if (targetNode && targetNode.type !== 'sum' && existingInConnections.length > 0) {
                        // Replace connection
                        this.connections = this.connections.filter(c => c.toNode !== toNodeId);
                    }

                    if (targetNode) {
                        this.connections.push({
                            id: this.generateId('conn'),
                            fromNode: fromNodeId,
                            toNode: toNodeId,
                            sign: targetNode.type === 'sum' ? '+' : '', // Summing junctions default to +
                            tapConnId: this.activeWire.tapConnId,
                            tapSegmentIndex: this.activeWire.tapSegmentIndex,
                            tapRatio: this.activeWire.tapRatio
                        });
                        this.onStateChange();
                    }
                }
            }
            this.activeWire = null;
            this.render();
        }

        this.draggedNode = null;
        this.draggedConnection = null;
    }

    getPortCoords(nodeId, type) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return { x: 0, y: 0 };

        const dir = node.direction || 'right';

        if (node.type === 'input') {
            if (dir === 'right') return { x: node.x + 35, y: node.y };
            if (dir === 'left') return { x: node.x - 35, y: node.y };
            if (dir === 'up') return { x: node.x, y: node.y - 35 };
            if (dir === 'down') return { x: node.x, y: node.y + 35 };
        } else if (node.type === 'output') {
            if (dir === 'right') return { x: node.x - 35, y: node.y };
            if (dir === 'left') return { x: node.x + 35, y: node.y };
            if (dir === 'up') return { x: node.x, y: node.y + 35 };
            if (dir === 'down') return { x: node.x, y: node.y - 35 };
        } else if (node.type === 'sum') {
            if (type === 'out') {
                if (dir === 'right') return { x: node.x + 25, y: node.y };
                if (dir === 'left') return { x: node.x - 25, y: node.y };
                if (dir === 'up') return { x: node.x, y: node.y - 25 };
                if (dir === 'down') return { x: node.x, y: node.y + 25 };
            } else {
                if (dir === 'right') return { x: node.x - 25, y: node.y };
                if (dir === 'left') return { x: node.x + 25, y: node.y };
                if (dir === 'up') return { x: node.x, y: node.y + 25 };
                if (dir === 'down') return { x: node.x, y: node.y - 25 };
            }
        } else {
            // Block
            const w = 110;
            const h = 55;
            if (type === 'in') {
                if (dir === 'right') return { x: node.x - w / 2, y: node.y };
                if (dir === 'left') return { x: node.x + w / 2, y: node.y };
                if (dir === 'up') return { x: node.x, y: node.y + h / 2 };
                if (dir === 'down') return { x: node.x, y: node.y - h / 2 };
            } else {
                if (dir === 'right') return { x: node.x + w / 2, y: node.y };
                if (dir === 'left') return { x: node.x - w / 2, y: node.y };
                if (dir === 'up') return { x: node.x, y: node.y - h / 2 };
                if (dir === 'down') return { x: node.x, y: node.y + h / 2 };
            }
        }
        return { x: node.x, y: node.y };
    }

    getConnectionPoints(conn) {
        const startNode = this.nodes.find(n => n.id === conn.fromNode);
        const endNode = this.nodes.find(n => n.id === conn.toNode);
        if (!startNode || !endNode) return [];

        let start = this.getPortCoords(conn.fromNode, 'out');
        if (conn.tapConnId) {
            const parentConn = this.connections.find(c => c.id === conn.tapConnId);
            if (parentConn) {
                const points = this.getConnectionPoints(parentConn);
                if (points.length > 0) {
                    const i = Math.min(conn.tapSegmentIndex, points.length - 2);
                    const p1 = points[i];
                    const p2 = points[i + 1];
                    if (p1 && p2) {
                        start = {
                            x: p1.x + (p2.x - p1.x) * conn.tapRatio,
                            y: p1.y + (p2.y - p1.y) * conn.tapRatio
                        };
                    }
                }
            }
        }
        
        let end = this.getPortCoords(conn.toNode, 'in');
        if (endNode.type === 'sum') {
            const dir = endNode.direction || 'right';
            let candidatePorts = [];
            
            if (dir === 'right') {
                candidatePorts = [
                    { x: endNode.x - 25, y: endNode.y },
                    { x: endNode.x, y: endNode.y - 25 },
                    { x: endNode.x, y: endNode.y + 25 }
                ];
            } else if (dir === 'left') {
                candidatePorts = [
                    { x: endNode.x + 25, y: endNode.y },
                    { x: endNode.x, y: endNode.y - 25 },
                    { x: endNode.x, y: endNode.y + 25 }
                ];
            } else if (dir === 'up') {
                candidatePorts = [
                    { x: endNode.x - 25, y: endNode.y },
                    { x: endNode.x + 25, y: endNode.y },
                    { x: endNode.x, y: endNode.y + 25 }
                ];
            } else if (dir === 'down') {
                candidatePorts = [
                    { x: endNode.x - 25, y: endNode.y },
                    { x: endNode.x + 25, y: endNode.y },
                    { x: endNode.x, y: endNode.y - 25 }
                ];
            }
            
            // Find closest candidate port to start
            let minDistance = Infinity;
            let closestPort = candidatePorts[0];
            candidatePorts.forEach(p => {
                const dist = Math.hypot(start.x - p.x, start.y - p.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestPort = p;
                }
            });
            end = closestPort;
        }

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        
        if (conn.midX !== undefined || conn.midY !== undefined) {
            if (conn.midX !== undefined) {
                return [
                    { x: start.x, y: start.y },
                    { x: conn.midX, y: start.y },
                    { x: conn.midX, y: end.y },
                    { x: end.x, y: end.y }
                ];
            } else {
                return [
                    { x: start.x, y: start.y },
                    { x: start.x, y: conn.midY },
                    { x: end.x, y: conn.midY },
                    { x: end.x, y: end.y }
                ];
            }
        } else {
            const startDir = startNode.direction || 'right';
            const endDir = endNode.direction || 'right';
            
            if (Math.abs(dy) < 8) {
                return [
                    { x: start.x, y: start.y },
                    { x: end.x, y: end.y }
                ];
            } else if (startDir === 'left' && startNode.type === 'block') {
                return [
                    { x: start.x, y: start.y },
                    { x: end.x, y: start.y },
                    { x: end.x, y: end.y }
                ];
            } else if (endDir === 'left' && endNode.type === 'block') {
                return [
                    { x: start.x, y: start.y },
                    { x: start.x, y: end.y },
                    { x: end.x, y: end.y }
                ];
            } else if (start.x > end.x && startDir === 'right' && endDir === 'right') {
                const midY = Math.max(start.y, end.y) + 70;
                return [
                    { x: start.x, y: start.y },
                    { x: start.x, y: midY },
                    { x: end.x, y: midY },
                    { x: end.x, y: end.y }
                ];
            } else {
                if (Math.abs(dx) > 30) {
                    const midX = start.x + dx / 2;
                    return [
                        { x: start.x, y: start.y },
                        { x: midX, y: start.y },
                        { x: midX, y: end.y },
                        { x: end.x, y: end.y }
                    ];
                } else {
                    const midY = start.y + dy / 2;
                    return [
                        { x: start.x, y: start.y },
                        { x: start.x, y: midY },
                        { x: end.x, y: midY },
                        { x: end.x, y: end.y }
                    ];
                }
            }
        }
    }

    getConnectionMidpoint(conn) {
        const points = this.getConnectionPoints(conn);
        if (points.length === 0) return { x: 0, y: 0, segmentIndex: 0, ratio: 0.5 };
        
        let totalLength = 0;
        const segments = [];
        for (let i = 0; i < points.length - 1; i++) {
            const dist = Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
            segments.push({ p1: points[i], p2: points[i+1], length: dist, index: i });
            totalLength += dist;
        }
        
        let halfLength = totalLength / 2;
        for (const seg of segments) {
            if (halfLength <= seg.length) {
                const ratio = seg.length > 0 ? halfLength / seg.length : 0.5;
                const x = seg.p1.x + (seg.p2.x - seg.p1.x) * ratio;
                const y = seg.p1.y + (seg.p2.y - seg.p1.y) * ratio;
                return { x, y, segmentIndex: seg.index, ratio };
            }
            halfLength -= seg.length;
        }
        
        const lastSeg = segments[segments.length - 1];
        if (lastSeg) {
            return { x: lastSeg.p2.x, y: lastSeg.p2.y, segmentIndex: lastSeg.index, ratio: 1.0 };
        }
        return { x: points[0].x, y: points[0].y, segmentIndex: 0, ratio: 0.5 };
    }

    updateNodeValue(id, value) {
        const node = this.nodes.find(n => n.id === id);
        if (node) {
            node.value = value;
            this.render();
            this.onStateChange();
        }
    }

    updateNodeLabel(id, label) {
        const node = this.nodes.find(n => n.id === id);
        if (node) {
            const oldLabel = node.label;
            node.label = label;
            // If the value was default or matched oldLabel, keep it in sync!
            if (node.type === 'block' && (node.value === 'G(s)' || node.value === oldLabel || node.value === 'G1' || node.value === 'G')) {
                node.value = label;
            }
            this.render();
            this.onStateChange();
        }
    }

    render() {
        this.svg.innerHTML = '';

        this.ensureViewBox();
        const vb = this.viewBox;
        this.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

        // Define grid background
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.03)" stroke-width="1"/>
            </pattern>
        `;
        this.svg.appendChild(defs);

        const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        gridRect.setAttribute('x', vb.x);
        gridRect.setAttribute('y', vb.y);
        gridRect.setAttribute('width', vb.w);
        gridRect.setAttribute('height', vb.h);
        gridRect.setAttribute('fill', 'url(#grid)');
        this.svg.appendChild(gridRect);

        // Draw blueprint if loaded
        if (this.blueprintImgData) {
            const blueprint = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            blueprint.setAttribute('id', 'canvas-blueprint');
            blueprint.setAttribute('x', vb.x);
            blueprint.setAttribute('y', vb.y);
            blueprint.setAttribute('width', vb.w);
            blueprint.setAttribute('height', vb.h);
            blueprint.setAttribute('opacity', this.blueprintOpacity);
            blueprint.setAttribute('style', 'pointer-events: none;');
            blueprint.setAttribute('href', this.blueprintImgData);
            blueprint.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', this.blueprintImgData);
            this.svg.appendChild(blueprint);
        }

        // Draw established connections
        for (const conn of this.connections) {
            this.drawConnection(conn);
        }

        // Draw temporary wire if drawing
        if (this.activeWire) {
            this.drawTempWire();
        }

        // Draw nodes
        for (const node of this.nodes) {
            this.drawNode(node);
        }
    }

    getIncomingPortSide(conn) {
        const startNode = this.nodes.find(n => n.id === conn.fromNode);
        const endNode = this.nodes.find(n => n.id === conn.toNode);
        if (!startNode || !endNode) return null;

        const start = this.getPortCoords(conn.fromNode, 'out');
        const dir = endNode.direction || 'right';
        
        let candidatePorts = [];
        if (dir === 'right') {
            candidatePorts = [
                { side: 'left', x: endNode.x - 25, y: endNode.y },
                { side: 'top', x: endNode.x, y: endNode.y - 25 },
                { side: 'bottom', x: endNode.x, y: endNode.y + 25 }
            ];
        } else if (dir === 'left') {
            candidatePorts = [
                { side: 'right', x: endNode.x + 25, y: endNode.y },
                { side: 'top', x: endNode.x, y: endNode.y - 25 },
                { side: 'bottom', x: endNode.x, y: endNode.y + 25 }
            ];
        } else if (dir === 'up') {
            candidatePorts = [
                { side: 'left', x: endNode.x - 25, y: endNode.y },
                { side: 'right', x: endNode.x + 25, y: endNode.y },
                { side: 'bottom', x: endNode.x, y: endNode.y + 25 }
            ];
        } else if (dir === 'down') {
            candidatePorts = [
                { side: 'left', x: endNode.x - 25, y: endNode.y },
                { side: 'right', x: endNode.x + 25, y: endNode.y },
                { side: 'top', x: endNode.x, y: endNode.y - 25 }
            ];
        }
        
        let minDistance = Infinity;
        let closestPort = candidatePorts[0];
        candidatePorts.forEach(p => {
            const dist = Math.hypot(start.x - p.x, start.y - p.y);
            if (dist < minDistance) {
                minDistance = dist;
                closestPort = p;
            }
        });
        
        return closestPort ? closestPort.side : null;
    }

    drawNode(node) {
        const isSelected = this.selectedElement && this.selectedElement.id === node.id;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'node-group');
        g.setAttribute('data-id', node.id);

        const dir = node.direction || 'right';

        if (node.type === 'input' || node.type === 'output' || node.type === 'disturbance') {
            const isDisturbance = node.type === 'disturbance';
            // Circle node
            const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circ.setAttribute('cx', node.x);
            circ.setAttribute('cy', node.y);
            circ.setAttribute('r', '25');
            circ.setAttribute('fill', '#1e293b');
            circ.setAttribute('stroke', isSelected ? '#3b82f6' : (isDisturbance ? '#f59e0b' : '#64748b'));
            circ.setAttribute('stroke-width', isSelected ? '3' : '2');
            circ.setAttribute('filter', 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))');
            g.appendChild(circ);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', node.x);
            text.setAttribute('y', node.y + 5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', isDisturbance ? '#fbbf24' : '#f8fafc');
            text.setAttribute('font-family', 'sans-serif');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('font-size', '14');
            text.textContent = node.label;
            g.appendChild(text);

            if (isDisturbance) {
                // Downward inject arrow above the circle, signalling an external input.
                const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                arrow.setAttribute('d', `M ${node.x} ${node.y - 48} L ${node.x} ${node.y - 28} M ${node.x - 5} ${node.y - 34} L ${node.x} ${node.y - 28} L ${node.x + 5} ${node.y - 34}`);
                arrow.setAttribute('stroke', '#f59e0b');
                arrow.setAttribute('stroke-width', '2');
                arrow.setAttribute('fill', 'none');
                g.appendChild(arrow);
            }

            // Add Ports based on direction.
            if (node.type === 'output') {
                let inX = node.x - 25, inY = node.y;
                if (dir === 'left') { inX = node.x + 25; }
                else if (dir === 'up') { inX = node.x; inY = node.y + 25; }
                else if (dir === 'down') { inX = node.x; inY = node.y - 25; }
                this.addPort(g, node.id, inX, inY, 'in');
            } else {
                // input and disturbance both expose a single output port.
                let outX = node.x + 25, outY = node.y;
                if (dir === 'left') { outX = node.x - 25; }
                else if (dir === 'up') { outX = node.x; outY = node.y - 25; }
                else if (dir === 'down') { outX = node.x; outY = node.y + 25; }
                this.addPort(g, node.id, outX, outY, 'out');
            }
        } else if (node.type === 'sum') {
            // Circular junction (larger circle with radius 25)
            const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circ.setAttribute('cx', node.x);
            circ.setAttribute('cy', node.y);
            circ.setAttribute('r', '25');
            circ.setAttribute('fill', '#0f172a');
            circ.setAttribute('stroke', isSelected ? '#3b82f6' : '#a855f7');
            circ.setAttribute('stroke-width', isSelected ? '3' : '2');
            circ.setAttribute('filter', 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))');
            g.appendChild(circ);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', node.x);
            text.setAttribute('y', node.y + 5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', '#c084fc');
            text.setAttribute('font-family', 'sans-serif');
            text.setAttribute('font-size', '16');
            text.setAttribute('font-weight', 'bold');
            text.textContent = 'Σ';
            g.appendChild(text);

            // Ports based on direction
            if (dir === 'right') {
                this.addPort(g, node.id, node.x - 25, node.y, 'in');
                this.addPort(g, node.id, node.x, node.y - 25, 'in');
                this.addPort(g, node.id, node.x, node.y + 25, 'in');
                this.addPort(g, node.id, node.x + 25, node.y, 'out');
            } else if (dir === 'left') {
                this.addPort(g, node.id, node.x + 25, node.y, 'in');
                this.addPort(g, node.id, node.x, node.y - 25, 'in');
                this.addPort(g, node.id, node.x, node.y + 25, 'in');
                this.addPort(g, node.id, node.x - 25, node.y, 'out');
            } else if (dir === 'up') {
                this.addPort(g, node.id, node.x - 25, node.y, 'in');
                this.addPort(g, node.id, node.x + 25, node.y, 'in');
                this.addPort(g, node.id, node.x, node.y + 25, 'in');
                this.addPort(g, node.id, node.x, node.y - 25, 'out');
            } else if (dir === 'down') {
                this.addPort(g, node.id, node.x - 25, node.y, 'in');
                this.addPort(g, node.id, node.x + 25, node.y, 'in');
                this.addPort(g, node.id, node.x, node.y - 25, 'in');
                this.addPort(g, node.id, node.x, node.y + 25, 'out');
            }

            // Draw incoming connection signs inside the summing circle
            const incoming = this.connections.filter(c => c.toNode === node.id);
            incoming.forEach(conn => {
                const side = this.getIncomingPortSide(conn);
                if (side) {
                    let sx = node.x, sy = node.y;
                    if (side === 'left') { sx = node.x - 14; sy = node.y + 4; }
                    else if (side === 'right') { sx = node.x + 14; sy = node.y + 4; }
                    else if (side === 'top') { sx = node.x; sy = node.y - 12; }
                    else if (side === 'bottom') { sx = node.x; sy = node.y + 16; }
                    
                    const signText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    signText.setAttribute('x', sx);
                    signText.setAttribute('y', sy);
                    signText.setAttribute('text-anchor', 'middle');
                    signText.setAttribute('fill', conn.sign === '+' ? '#10b981' : '#ef4444');
                    signText.setAttribute('font-family', 'sans-serif');
                    signText.setAttribute('font-weight', 'bold');
                    signText.setAttribute('font-size', '13');
                    signText.setAttribute('class', 'sum-junction-sign');
                    signText.setAttribute('data-conn-id', conn.id);
                    signText.style.cursor = 'pointer';
                    signText.style.userSelect = 'none';
                    signText.textContent = conn.sign || '+';
                    g.appendChild(signText);
                }
            });
        } else if (node.type === 'block') {
            // Block rectangle
            const width = 110;
            const height = 55;

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', node.x - width / 2);
            rect.setAttribute('y', node.y - height / 2);
            rect.setAttribute('width', width);
            rect.setAttribute('height', height);
            rect.setAttribute('rx', '6');
            rect.setAttribute('fill', '#1e293b');
            rect.setAttribute('stroke', isSelected ? '#3b82f6' : '#475569');
            rect.setAttribute('stroke-width', isSelected ? '3' : '2');
            rect.setAttribute('filter', 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))');
            g.appendChild(rect);

            // Label
            const textLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textLabel.setAttribute('x', node.x);
            textLabel.setAttribute('y', node.y - 8);
            textLabel.setAttribute('text-anchor', 'middle');
            textLabel.setAttribute('fill', '#94a3b8');
            textLabel.setAttribute('font-family', 'sans-serif');
            textLabel.setAttribute('font-size', '11');
            textLabel.textContent = node.label;
            g.appendChild(textLabel);

            // Transfer function formula string
            const textVal = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textVal.setAttribute('x', node.x);
            textVal.setAttribute('y', node.y + 12);
            textVal.setAttribute('text-anchor', 'middle');
            textVal.setAttribute('fill', '#f1f5f9');
            textVal.setAttribute('font-family', 'sans-serif');
            textVal.setAttribute('font-weight', 'bold');
            textVal.setAttribute('font-size', '13');
            
            // Clean display value length
            let dispVal = node.value;
            if (dispVal.length > 13) dispVal = dispVal.substring(0, 11) + '...';
            textVal.textContent = dispVal;
            g.appendChild(textVal);

            // Ports based on direction
            if (dir === 'right') {
                this.addPort(g, node.id, node.x - width / 2, node.y, 'in');
                this.addPort(g, node.id, node.x + width / 2, node.y, 'out');
            } else if (dir === 'left') {
                this.addPort(g, node.id, node.x + width / 2, node.y, 'in');
                this.addPort(g, node.id, node.x - width / 2, node.y, 'out');
            } else if (dir === 'up') {
                this.addPort(g, node.id, node.x, node.y + height / 2, 'in');
                this.addPort(g, node.id, node.x, node.y - height / 2, 'out');
            } else if (dir === 'down') {
                this.addPort(g, node.id, node.x, node.y - height / 2, 'in');
                this.addPort(g, node.id, node.x, node.y + height / 2, 'out');
            }
        }

        this.svg.appendChild(g);
    }

    addPort(group, nodeId, x, y, type) {
        const port = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        port.setAttribute('class', 'port');
        port.setAttribute('cx', x);
        port.setAttribute('cy', y);
        port.setAttribute('r', '5');
        port.setAttribute('fill', type === 'in' ? '#ef4444' : '#10b981');
        port.setAttribute('stroke', '#0f172a');
        port.setAttribute('stroke-width', '1.5');
        port.setAttribute('data-node', nodeId);
        port.setAttribute('data-port-type', type);
        group.appendChild(port);
    }

    drawConnection(conn) {
        const isSelected = this.selectedElement && this.selectedElement.id === conn.id;

        const startNode = this.nodes.find(n => n.id === conn.fromNode);
        const endNode = this.nodes.find(n => n.id === conn.toNode);
        if (!startNode || !endNode) return;

        const points = this.getConnectionPoints(conn);
        if (points.length === 0) return;

        // Draw orthogonal 90-degree wire
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'connection-line');
        path.setAttribute('data-id', conn.id);
        
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            const prev = points[i - 1];
            if (p.x === prev.x) {
                d += ` V ${p.y}`;
            } else if (p.y === prev.y) {
                d += ` H ${p.x}`;
            } else {
                d += ` L ${p.x} ${p.y}`;
            }
        }
        
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', isSelected ? '#3b82f6' : 'rgba(96, 165, 250, 0.7)');
        path.setAttribute('stroke-width', isSelected ? '4' : '2.5');
        path.setAttribute('marker-end', 'url(#arrow)');
        this.svg.appendChild(path);

        // Wide transparent hit-area on top, so the whole wire is easy to grab:
        // drag from anywhere on it to branch a new take-off; click to select.
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hit.setAttribute('class', 'connection-line connection-hit');
        hit.setAttribute('data-id', conn.id);
        hit.setAttribute('d', d);
        hit.setAttribute('fill', 'none');
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '14');
        hit.style.cursor = 'move'; // plain drag moves; Shift+drag branches
        this.svg.appendChild(hit);

        // Add arrowhead helper
        this.addArrowheadMarker();

        // Draw solid blue junction dot at branch start if tapped from another wire
        if (conn.tapConnId) {
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', points[0].x);
            dot.setAttribute('cy', points[0].y);
            dot.setAttribute('r', '4.5');
            dot.setAttribute('fill', '#60a5fa');
            dot.setAttribute('stroke', '#1e3a8a');
            dot.setAttribute('stroke-width', '1');
            this.svg.appendChild(dot);
        }

    }

    // Nearest point on a wire to a click, as {segmentIndex, ratio, x, y}.
    // Used to anchor a new take-off branch exactly where the user grabbed the wire.
    getNearestPointOnConnection(conn, coords) {
        const points = this.getConnectionPoints(conn);
        let best = { segmentIndex: 0, ratio: 0.5, x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, dist: Infinity };
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i], p2 = points[i + 1];
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const len2 = dx * dx + dy * dy;
            let t = len2 > 0 ? ((coords.x - p1.x) * dx + (coords.y - p1.y) * dy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const x = p1.x + dx * t, y = p1.y + dy * t;
            const dist = Math.hypot(coords.x - x, coords.y - y);
            if (dist < best.dist) best = { segmentIndex: i, ratio: t, x, y, dist };
        }
        return best;
    }

    drawTempWire() {
        const start = this.activeWire.fromPortCoords;
        const end = this.activeWire.currentCoords;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        let d = "";
        
        if (Math.abs(dx) > 30) {
            const midX = start.x + dx / 2;
            d = `M ${start.x} ${start.y} H ${midX} V ${end.y} H ${end.x}`;
        } else {
            const midY = start.y + dy / 2;
            d = `M ${start.x} ${start.y} V ${midY} H ${end.x} V ${end.y}`;
        }
        
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(96, 165, 250, 0.6)'); // Sleek modern light blue during dragging
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-dasharray', '4,4');
        this.svg.appendChild(path);
    }

    addArrowheadMarker() {
        let marker = this.svg.querySelector('marker#arrow');
        if (!marker) {
            marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'arrow');
            marker.setAttribute('viewBox', '0 0 10 10');
            marker.setAttribute('refX', '7'); // Distance from endpoint
            marker.setAttribute('refY', '5');
            marker.setAttribute('markerWidth', '6');
            marker.setAttribute('markerHeight', '6');
            marker.setAttribute('orient', 'auto-start-reverse');
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M 0 1.5 L 8 5 L 0 8.5 z');
            path.setAttribute('fill', '#60a5fa');
            
            marker.appendChild(path);
            this.svg.querySelector('defs').appendChild(marker);
        }
    }
}
