/**
 * vision-analyzer.js
 * 100% Offline Visual Block Diagram Topology Reconstruction Engine.
 * Built using pure JavaScript HTML5 Canvas pixel manipulation.
 */

// 1. Otsu's Thresholding (Parameter-free)
export function otsuThreshold(pixels, width, height) {
    const hist = new Int32Array(256);
    const len = width * height;
    
    for (let i = 0; i < len; i++) {
        const val = pixels[i * 4]; // Use Red channel as grayscale luminance
        hist[val]++;
    }

    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let varMax = 0;
    let threshold = 128; // Standard fallback

    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;

        wF = len - wB;
        if (wF === 0) break;

        sumB += t * hist[t];

        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;

        const varBetween = wB * wF * (mB - mF) * (mB - mF);

        if (varBetween > varMax) {
            varMax = varBetween;
            threshold = t;
        }
    }
    
    // Fallback for degenerate thresholds (e.g. pure binary images where split is at 0)
    if (threshold <= 5 || threshold >= 250) {
        threshold = 127;
    }
    
    return threshold;
}

// 2. Grayscale binarizer
export function binarize(pixels, width, height, threshold) {
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        const val = pixels[i * 4];
        binary[i] = val < threshold ? 1 : 0; // 1 is foreground (black), 0 is background (white)
    }
    return binary;
}

// 3. Morphological close (Dilation followed by Erosion)
export function dilate3x3(binary, width, height) {
    const dilated = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            let val = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        if (binary[ny * width + nx] === 1) {
                            val = 1;
                            break;
                        }
                    }
                }
                if (val === 1) break;
            }
            dilated[idx] = val;
        }
    }
    return dilated;
}

export function erode3x3(binary, width, height) {
    const eroded = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            let val = 1;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        if (binary[ny * width + nx] === 0) {
                            val = 0;
                            break;
                        }
                    } else {
                        val = 0; // Out of bounds counts as background
                        break;
                    }
                }
                if (val === 0) break;
            }
            eroded[idx] = val;
        }
    }
    return eroded;
}

export function morphClose(binary, width, height) {
    return erode3x3(dilate3x3(binary, width, height), width, height);
}

// 4. Border Inward Flood Fill
export function floodFillBorder(binary, width, height) {
    const flooded = new Uint8Array(width * height); // 1 = reached background, 0 = unreached/interior
    const queue = [];

    // Push all background pixels on the outer borders
    for (let x = 0; x < width; x++) {
        const idxTop = x;
        if (binary[idxTop] === 0) {
            flooded[idxTop] = 1;
            queue.push(idxTop);
        }
        const idxBottom = (height - 1) * width + x;
        if (binary[idxBottom] === 0 && !flooded[idxBottom]) {
            flooded[idxBottom] = 1;
            queue.push(idxBottom);
        }
    }
    for (let y = 0; y < height; y++) {
        const idxLeft = y * width;
        if (binary[idxLeft] === 0 && !flooded[idxLeft]) {
            flooded[idxLeft] = 1;
            queue.push(idxLeft);
        }
        const idxRight = y * width + (width - 1);
        if (binary[idxRight] === 0 && !flooded[idxRight]) {
            flooded[idxRight] = 1;
            queue.push(idxRight);
        }
    }

    // BFS
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        const cx = idx % width;
        const cy = Math.floor(idx / width);

        const neighbors = [
            { x: cx - 1, y: cy },
            { x: cx + 1, y: cy },
            { x: cx, y: cy - 1 },
            { x: cx, y: cy + 1 }
        ];

        for (let i = 0; i < neighbors.length; i++) {
            const nx = neighbors[i].x;
            const ny = neighbors[i].y;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (binary[nIdx] === 0 && !flooded[nIdx]) {
                    flooded[nIdx] = 1;
                    queue.push(nIdx);
                }
            }
        }
    }
    return flooded;
}

// 5. Segment Enclosures
export function findEnclosedShapes(binary, flooded, width, height) {
    const visited = new Uint8Array(width * height);
    const shapes = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (binary[idx] === 0 && flooded[idx] === 0 && !visited[idx]) {
                const shapePixels = [];
                const queue = [idx];
                visited[idx] = 1;

                let minX = x, maxX = x, minY = y, maxY = y;
                let head = 0;
                while (head < queue.length) {
                    const cIdx = queue[head++];
                    shapePixels.push(cIdx);

                    const cx = cIdx % width;
                    const cy = Math.floor(cIdx / width);

                    minX = Math.min(minX, cx);
                    maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy);
                    maxY = Math.max(maxY, cy);

                    const neighbors = [
                        { x: cx - 1, y: cy },
                        { x: cx + 1, y: cy },
                        { x: cx, y: cy - 1 },
                        { x: cx, y: cy + 1 }
                    ];

                    for (let i = 0; i < neighbors.length; i++) {
                        const nx = neighbors[i].x;
                        const ny = neighbors[i].y;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (binary[nIdx] === 0 && flooded[nIdx] === 0 && !visited[nIdx]) {
                                visited[nIdx] = 1;
                                queue.push(nIdx);
                            }
                        }
                    }
                }

                // Filter out small stroke/text noise
                if (shapePixels.length > 25) {
                    shapes.push({
                        pixels: shapePixels,
                        minX, maxX, minY, maxY,
                        width: maxX - minX + 1,
                        height: maxY - minY + 1,
                        area: shapePixels.length
                    });
                }
            }
        }
    }
    return shapes;
}

// 6. Merging / Bounding Box Grouping
export function groupShapes(shapes) {
    if (shapes.length === 0) return [];
    
    const groups = [];
    const visited = new Set();

    for (let i = 0; i < shapes.length; i++) {
        if (visited.has(i)) continue;

        const currentGroup = [shapes[i]];
        visited.add(i);

        let minX = shapes[i].minX;
        let maxX = shapes[i].maxX;
        let minY = shapes[i].minY;
        let maxY = shapes[i].maxY;

        let expanded = true;
        while (expanded) {
            expanded = false;
            for (let j = 0; j < shapes.length; j++) {
                if (visited.has(j)) continue;

                const s = shapes[j];
                const pad = 15; // Proximity merge padding
                const xOverlap = Math.max(0, Math.min(maxX, s.maxX) - Math.max(minX, s.minX) + pad) > 0;
                const yOverlap = Math.max(0, Math.min(maxY, s.maxY) - Math.max(minY, s.minY) + pad) > 0;

                if (xOverlap && yOverlap) {
                    currentGroup.push(s);
                    visited.add(j);
                    
                    minX = Math.min(minX, s.minX);
                    maxX = Math.max(maxX, s.maxX);
                    minY = Math.min(minY, s.minY);
                    maxY = Math.max(maxY, s.maxY);
                    
                    expanded = true;
                }
            }
        }

        let totalArea = 0;
        currentGroup.forEach(s => totalArea += s.area);

        groups.push({
            id: `shape_${groups.length + 1}`,
            minX, maxX, minY, maxY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            area: totalArea,
            components: currentGroup
        });
    }
    return groups;
}

// 7. Fallback Connected Component Labeling for leaked shapes
export function runForegroundCCL(binary, width, height) {
    const visited = new Uint8Array(width * height);
    const components = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (binary[idx] === 1 && !visited[idx]) {
                const compPixels = [];
                const queue = [idx];
                visited[idx] = 1;

                let minX = x, maxX = x, minY = y, maxY = y;
                let head = 0;
                while (head < queue.length) {
                    const cIdx = queue[head++];
                    compPixels.push(cIdx);

                    const cx = cIdx % width;
                    const cy = Math.floor(cIdx / width);

                    minX = Math.min(minX, cx);
                    maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy);
                    maxY = Math.max(maxY, cy);

                    // 8-neighborhood
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = cx + dx;
                            const ny = cy + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nIdx = ny * width + nx;
                                if (binary[nIdx] === 1 && !visited[nIdx]) {
                                    visited[nIdx] = 1;
                                    queue.push(nIdx);
                                }
                            }
                        }
                    }
                }

                const compW = maxX - minX + 1;
                const compH = maxY - minY + 1;
                if (compPixels.length > 25 || compW > 15 || compH > 15) {
                    components.push({
                        pixels: compPixels,
                        minX, maxX, minY, maxY,
                        width: compW,
                        height: compH,
                        area: compPixels.length
                    });
                }
            }
        }
    }
    return components;
}

// 8. Collinear run mergers
function mergeCollinearHoriz(wires) {
    const merged = [];
    const visited = new Set();

    for (let i = 0; i < wires.length; i++) {
        if (visited.has(i)) continue;

        let w1 = wires[i];
        visited.add(i);

        let expanded = true;
        while (expanded) {
            expanded = false;
            for (let j = 0; j < wires.length; j++) {
                if (visited.has(j)) continue;

                let w2 = wires[j];
                const yDiff = Math.abs(w1.y1 - w2.y1);
                if (yDiff <= 3) {
                    const minX1 = Math.min(w1.x1, w1.x2);
                    const maxX1 = Math.max(w1.x1, w1.x2);
                    const minX2 = Math.min(w2.x1, w2.x2);
                    const maxX2 = Math.max(w2.x1, w2.x2);

                    const overlap = Math.max(0, Math.min(maxX1, maxX2) - Math.max(minX1, minX2) + 8) > 0;
                    if (overlap) {
                        w1 = {
                            x1: Math.min(minX1, minX2),
                            y1: Math.round((w1.y1 + w2.y1) / 2),
                            x2: Math.max(maxX1, maxX2),
                            y2: Math.round((w1.y2 + w2.y2) / 2),
                            type: 'h'
                        };
                        visited.add(j);
                        expanded = true;
                    }
                }
            }
        }
        merged.push(w1);
    }
    return merged;
}

function mergeCollinearVert(wires) {
    const merged = [];
    const visited = new Set();

    for (let i = 0; i < wires.length; i++) {
        if (visited.has(i)) continue;

        let w1 = wires[i];
        visited.add(i);

        let expanded = true;
        while (expanded) {
            expanded = false;
            for (let j = 0; j < wires.length; j++) {
                if (visited.has(j)) continue;

                let w2 = wires[j];
                const xDiff = Math.abs(w1.x1 - w2.x1);
                if (xDiff <= 3) {
                    const minY1 = Math.min(w1.y1, w1.y2);
                    const maxY1 = Math.max(w1.y1, w1.y2);
                    const minY2 = Math.min(w2.y1, w2.y2);
                    const maxY2 = Math.max(w2.y1, w2.y2);

                    const overlap = Math.max(0, Math.min(maxY1, maxY2) - Math.max(minY1, minY2) + 8) > 0;
                    if (overlap) {
                        w1 = {
                            x1: Math.round((w1.x1 + w2.x1) / 2),
                            y1: Math.min(minY1, minY2),
                            x2: Math.round((w1.x2 + w2.x2) / 2),
                            y2: Math.max(maxY1, maxY2),
                            type: 'v'
                        };
                        visited.add(j);
                        expanded = true;
                    }
                }
            }
        }
        merged.push(w1);
    }
    return merged;
}

// 9. Snapping
function snapEndpoint(ex, ey, shapes, taps) {
    let bestNode = null;
    let minDist = 30; // Snapping radius
    let snapX = ex;
    let snapY = ey;

    // Check shapes
    shapes.forEach(s => {
        const cx = Math.max(s.minX, Math.min(s.maxX, ex));
        const cy = Math.max(s.minY, Math.min(s.maxY, ey));
        const dx = ex - cx;
        const dy = ey - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist) {
            minDist = dist;
            bestNode = { type: 'shape', id: s.id, x: cx, y: cy };
            snapX = cx;
            snapY = cy;
        }
    });

    // Check Taps
    taps.forEach(t => {
        const dx = ex - t.x;
        const dy = ey - t.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
            minDist = dist;
            bestNode = { type: 'tap', id: t.id, x: t.x, y: t.y };
            snapX = t.x;
            snapY = t.y;
        }
    });

    return bestNode ? { node: bestNode, x: snapX, y: snapY } : null;
}

// MAIN ENTRY POINT
export function analyzeImageTopology(grayscaleData, width, height) {
    // 1. Otsu thresholding
    const threshold = otsuThreshold(grayscaleData, width, height);
    console.log(`[Diagnostic] Otsu threshold: ${threshold}`);
    
    // 2. Pre-closed binarizer for wire tracing
    const binary = binarize(grayscaleData, width, height, threshold);
    let binFg = 0;
    for (let i = 0; i < binary.length; i++) if (binary[i] === 1) binFg++;
    console.log(`[Diagnostic] Binary foreground pixels: ${binFg}`);
    
    // 3. Morphological close for enclosed shapes
    const closed = morphClose(binary, width, height);
    let closedFg = 0;
    for (let i = 0; i < closed.length; i++) if (closed[i] === 1) closedFg++;
    console.log(`[Diagnostic] Closed foreground pixels: ${closedFg}`);
    
    // 4. Border inward flood fill
    const flooded = floodFillBorder(closed, width, height);
    let floodBg = 0;
    for (let i = 0; i < flooded.length; i++) if (flooded[i] === 1) floodBg++;
    console.log(`[Diagnostic] Flooded background pixels: ${floodBg} / ${width * height} (${(floodBg / (width * height) * 100).toFixed(2)}%)`);
    
    // Find enclosed shapes (always run)
    const rawEnclosures = findEnclosedShapes(closed, flooded, width, height);
    console.log(`[Diagnostic] Raw Enclosures found: ${rawEnclosures.length}`);
    const enclosedShapes = groupShapes(rawEnclosures);
    console.log(`[Diagnostic] Grouped Enclosed Shapes found: ${enclosedShapes.length}`);

    // 5. Wire scanning (pre-closed binary!)
    // For wire blocking, we block out the current enclosed shapes first
    const insideShapeTemp = new Uint8Array(width * height);
    enclosedShapes.forEach(s => {
        const pad = 2;
        const minX = Math.max(0, s.minX - pad);
        const maxX = Math.min(width - 1, s.maxX + pad);
        const minY = Math.max(0, s.minY - pad);
        const maxY = Math.min(height - 1, s.maxY + pad);
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                insideShapeTemp[y * width + x] = 1;
            }
        }
    });

    const L_min = 20;
    const horizWires = [];
    for (let y = 0; y < height; y++) {
        let startX = -1;
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const isFore = binary[idx] === 1 && insideShapeTemp[idx] === 0;
            if (isFore) {
                if (startX === -1) startX = x;
            } else {
                if (startX !== -1) {
                    if ((x - startX) >= L_min) {
                        horizWires.push({ x1: startX, y1: y, x2: x - 1, y2: y, type: 'h' });
                    }
                    startX = -1;
                }
            }
        }
        if (startX !== -1 && (width - startX) >= L_min) {
            horizWires.push({ x1: startX, y1: y, x2: width - 1, y2: y, type: 'h' });
        }
    }

    const vertWires = [];
    for (let x = 0; x < width; x++) {
        let startY = -1;
        for (let y = 0; y < height; y++) {
            const idx = y * width + x;
            const isFore = binary[idx] === 1 && insideShapeTemp[idx] === 0;
            if (isFore) {
                if (startY === -1) startY = y;
            } else {
                if (startY !== -1) {
                    if ((y - startY) >= L_min) {
                        vertWires.push({ x1: x, y1: startY, x2: x, y2: y - 1, type: 'v' });
                    }
                    startY = -1;
                }
            }
        }
        if (startY !== -1 && (height - startY) >= L_min) {
            vertWires.push({ x1: x, y1: startY, x2: x, y2: height - 1, type: 'v' });
        }
    }

    const horizMerged = mergeCollinearHoriz(horizWires);
    const vertMerged = mergeCollinearVert(vertWires);
    const allWires = [...horizMerged, ...vertMerged];

    // Intersection & Tap detection
    const intersections = [];
    horizMerged.forEach(h => {
        vertMerged.forEach(v => {
            const xOverlap = v.x1 >= h.x1 - 3 && v.x1 <= h.x2 + 3;
            const yOverlap = h.y1 >= v.y1 - 3 && h.y1 <= v.y2 + 3;
            if (xOverlap && yOverlap) {
                intersections.push({ x: v.x1, y: h.y1, hWire: h, vWire: v });
            }
        });
    });

    const taps = [];
    intersections.forEach(inter => {
        const { x, y, hWire, vWire } = inter;
        const up = vWire.y1 < y - 5;
        const down = vWire.y2 > y + 5;
        const left = hWire.x1 < x - 5;
        const right = hWire.x2 > x + 5;

        let incidentDirs = 0;
        if (up) incidentDirs++;
        if (down) incidentDirs++;
        if (left) incidentDirs++;
        if (right) incidentDirs++;

        if (incidentDirs === 3) {
            taps.push({ x, y, id: `tap_${taps.length + 1}` });
        }
    });

    // 6. Run wire-stripped connected component (CCL) shape scanner
    const wireStripped = new Uint8Array(binary);
    allWires.forEach(w => {
        if (w.type === 'v') {
            const minY = Math.min(w.y1, w.y2);
            const maxY = Math.max(w.y1, w.y2);
            for (let y = minY; y <= maxY; y++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = w.x1 + dx;
                    if (nx >= 0 && nx < width) wireStripped[y * width + nx] = 0;
                }
            }
        } else {
            const minX = Math.min(w.x1, w.x2);
            const maxX = Math.max(w.x1, w.x2);
            for (let x = minX; x <= maxX; x++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = w.y1 + dy;
                    if (ny >= 0 && ny < height) wireStripped[ny * width + x] = 0;
                }
            }
        }
    });

    // Run Connected Component Labeling on wire-stripped strokes!
    const rawForegroundComps = runForegroundCCL(wireStripped, width, height);
    const cclShapes = groupShapes(rawForegroundComps);
    console.log(`[Diagnostic] Raw CCL components found: ${rawForegroundComps.length}`);
    console.log(`[Diagnostic] Grouped CCL Shapes found: ${cclShapes.length}`);

    // Reconcile enclosed shapes and CCL shapes!
    const finalShapes = [...enclosedShapes];
    
    cclShapes.forEach(c => {
        // Check if c overlaps significantly with any shape in finalShapes
        let overlap = false;
        for (let i = 0; i < finalShapes.length; i++) {
            const s = finalShapes[i];
            
            // Check bounding box intersection with a loose margin
            const pad = 5;
            const xOverlap = Math.max(0, Math.min(s.maxX, c.maxX) - Math.max(s.minX, c.minX) + pad) > 0;
            const yOverlap = Math.max(0, Math.min(s.maxY, c.maxY) - Math.max(s.minY, c.minY) + pad) > 0;
            
            if (xOverlap && yOverlap) {
                overlap = true;
                break;
            }
        }
        
        if (!overlap) {
            // No overlap, so c is a leaked block or shape! Add it!
            c.id = `shape_${finalShapes.length + 1}`;
            finalShapes.push(c);
        }
    });

    const shapes = finalShapes;
    console.log(`[Diagnostic] Reconciled Shapes count: ${shapes.length}`);

    // 7. DPI-Independent Sizing Classification
    if (shapes.length > 0) {
        const sortedAreas = shapes.map(s => s.area).sort((a, b) => a - b);
        const mid = Math.floor(sortedAreas.length / 2);
        const medianArea = sortedAreas.length % 2 !== 0 ? sortedAreas[mid] : (sortedAreas[mid - 1] + sortedAreas[mid]) / 2;

        shapes.forEach(s => {
            if (s.area < 0.5 * medianArea) {
                s.type = 'sum';
            } else {
                s.type = 'block';
            }
        });
    }

    // 8. Snap Wire Endpoints & Directed Graph Topological Wiring
    const rawConns = [];
    const danglingEndpoints = [];

    allWires.forEach(w => {
        const startSnap = snapEndpoint(w.x1, w.y1, shapes, taps);
        const endSnap = snapEndpoint(w.x2, w.y2, shapes, taps);

        if (startSnap && endSnap) {
            rawConns.push({
                fromNode: startSnap.node.id,
                fromType: startSnap.node.type,
                toNode: endSnap.node.id,
                toType: endSnap.node.type,
                sign: ''
            });
        } else {
            // Found dangling endpoints
            if (!startSnap) danglingEndpoints.push({ x: w.x1, y: w.y1 });
            if (!endSnap) danglingEndpoints.push({ x: w.x2, y: w.y2 });
        }
    });

    // Determine Terminal Nodes (Input R / Output Y) from leftmost and rightmost dangling endpoints
    const terminals = [];
    if (danglingEndpoints.length > 0) {
        danglingEndpoints.sort((a, b) => a.x - b.x);
        
        const leftmost = danglingEndpoints[0];
        const rightmost = danglingEndpoints[danglingEndpoints.length - 1];

        terminals.push({
            id: 'input_r',
            type: 'input',
            x: leftmost.x,
            y: leftmost.y,
            label: 'R'
        });

        terminals.push({
            id: 'output_y',
            type: 'output',
            x: rightmost.x,
            y: rightmost.y,
            label: 'Y'
        });
        
        // Connect Input terminal to the closest snapped node to the leftmost point
        let closestStart = snapEndpoint(leftmost.x, leftmost.y, shapes, taps);
        if (closestStart) {
            rawConns.push({
                fromNode: 'input_r',
                fromType: 'input',
                toNode: closestStart.node.id,
                toType: closestStart.node.type,
                sign: ''
            });
        }

        // Connect output terminal from the closest snapped node to the rightmost point
        let closestEnd = snapEndpoint(rightmost.x, rightmost.y, shapes, taps);
        if (closestEnd) {
            rawConns.push({
                fromNode: closestEnd.node.id,
                fromType: closestEnd.node.type,
                toNode: 'output_y',
                toType: 'output',
                sign: ''
            });
        }
    }

    // Trace Taps: if a connection goes to/from a tap, resolve it
    const finalConnections = [];
    
    // Group connections by fromNode/toNode
    const connectionsMap = [];
    
    rawConns.forEach(c => {
        // Resolve Tap connections by traversing through Taps
        if (c.fromNode.startsWith('tap_')) {
            // Find incoming connection to this Tap
            const incoming = rawConns.find(inC => inC.toNode === c.fromNode);
            if (incoming) {
                c.fromNode = incoming.fromNode;
                c.fromType = incoming.fromType;
            }
        }
        if (c.toNode.startsWith('tap_')) {
            // Find outgoing connection from this Tap
            const outgoing = rawConns.find(outC => outC.fromNode === c.toNode);
            if (outgoing) {
                c.toNode = outgoing.toNode;
                c.toType = outgoing.toType;
            }
        }

        if (c.fromNode !== c.toNode && !c.fromNode.startsWith('tap_') && !c.toNode.startsWith('tap_')) {
            // Default signs
            let defaultSign = '';
            if (c.toNode.startsWith('shape_')) {
                const targetShape = shapes.find(s => s.id === c.toNode);
                if (targetShape && targetShape.type === 'sum') {
                    // Check if it is a feedback connection: goes from right to left
                    const sourceNode = shapes.find(s => s.id === c.fromNode);
                    if (sourceNode && sourceNode.minX > targetShape.minX) {
                        defaultSign = '-'; // feedback flows backwards, default negative feedback
                    } else {
                        defaultSign = '+'; // fwd path flows forward, default plus sum
                    }
                }
            }
            c.sign = defaultSign;

            // Prevent duplicates
            const isDuplicate = connectionsMap.some(exist => exist.fromNode === c.fromNode && exist.toNode === c.toNode);
            if (!isDuplicate) {
                connectionsMap.push(c);
                finalConnections.push({
                    fromNode: c.fromNode,
                    toNode: c.toNode,
                    sign: c.sign
                });
            }
        }
    });

    return {
        shapes,
        terminals,
        taps,
        connections: finalConnections
    };
}
