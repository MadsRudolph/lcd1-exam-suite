/**
 * app.js
 * Main controller orchestrating UI events, diagram state changes, 
 * KaTeX formula rendering, and loading pre-defined exam templates.
 */

import { BlockDiagramCanvas } from './canvas.js';
import { solveBlockDiagram, transferFunction, collectEndpoints, loopGain } from './solver.js';
import { analyzeDiagram, complexKaTeX, fmtNum } from './analysis.js';
import { TransferFunction } from './math-engine.js';
import { analyzeImageTopology } from './vision-analyzer.js';
import { TEMPLATES, TEMPLATE_GROUPS } from './templates.js';
import { createDiagramStore } from './diagram-store.js';
import './lcd-solver-ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const svgEl = document.getElementById('diagram-svg');
    
    // UI Elements
    const addInputBtn = document.getElementById('add-input-btn');
    const addOutputBtn = document.getElementById('add-output-btn');
    const addBlockBtn = document.getElementById('add-block-btn');
    const addSumBtn = document.getElementById('add-sum-btn');
    const addDisturbanceBtn = document.getElementById('add-disturbance-btn');
    const solveBtn = document.getElementById('solve-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    const propPanel = document.getElementById('properties-panel');
    const noPropMsg = document.getElementById('no-properties-msg');
    const propLabelInput = document.getElementById('prop-label');
    const propValInput = document.getElementById('prop-value');
    const propValLabel = document.getElementById('prop-value-label');
    
    const tfOutput = document.getElementById('tf-output');
    const analysisOutput = document.getElementById('analysis-output');
    const sourceSelect = document.getElementById('source-select');
    const sinkSelect = document.getElementById('sink-select');

    // Label shown for the current result, e.g. "Y/R", "Y/D", or "L(s)".
    let currentTfLabel = 'Y/R';

    // Build the KaTeX left-hand side for a label like "Y/R" or "L(s)".
    function lhsLatex(label) {
        if (label === 'L(s)') return 'L(s)';
        const [num, den] = label.split('/');
        return `\\frac{${num}(s)}{${den || ''}(s)}`;
    }

    function fillSelect(select, items) {
        const prev = select.value;
        select.innerHTML = '';
        items.forEach(it => {
            const opt = document.createElement('option');
            opt.value = it.id;
            opt.textContent = it.label;
            select.appendChild(opt);
        });
        if (items.some(it => it.id === prev)) {
            select.value = prev; // preserve the user's choice across refreshes
        }
    }

    function refreshEndpointDropdowns() {
        const { sources, sinks } = collectEndpoints(canvas.nodes);
        fillSelect(sourceSelect, sources);
        fillSelect(sinkSelect, sinks);
    }

    // Initialize Canvas
    const canvas = new BlockDiagramCanvas(svgEl, () => {
        handleStateChange();
        updateDiagramStats();
        refreshEndpointDropdowns();
    });

    document.getElementById('zoom-in-btn').addEventListener('click', () => canvas.zoomIn());
    document.getElementById('zoom-out-btn').addEventListener('click', () => canvas.zoomOut());
    document.getElementById('zoom-reset-btn').addEventListener('click', () => canvas.resetView());
    document.getElementById('zoom-fit-btn').addEventListener('click', () => canvas.fitView());

    // Add Nodes
    addInputBtn.addEventListener('click', () => {
        canvas.addNode('input', 80, 200, '1', 'R');
    });
    addOutputBtn.addEventListener('click', () => {
        canvas.addNode('output', 600, 200, '1', 'Y');
    });
    addBlockBtn.addEventListener('click', () => {
        canvas.addNode('block', 300, 200, 'G(s)', 'G1');
    });
    addSumBtn.addEventListener('click', () => {
        canvas.addNode('sum', 180, 200, '', 'Σ');
    });
    if (addDisturbanceBtn) {
        addDisturbanceBtn.addEventListener('click', () => {
            canvas.addNode('disturbance', 180, 360, '1', 'D');
        });
    }

    const breakLoopBtn = document.getElementById('break-loop-btn');
    if (breakLoopBtn) {
        breakLoopBtn.addEventListener('click', () => {
            tfOutput.innerHTML = `<span style="color: var(--accent-blue); font-size: 13px;">Click a wire to break the loop there…</span>`;
            canvas.enterBreakMode((connId) => {
                try {
                    const result = loopGain(canvas.nodes, canvas.connections, connId);
                    lastSolutionResult = result;
                    currentTfLabel = 'L(s)';
                    renderMathSolution(result, 'L(s)');
                    renderAnalysis(analyzeDiagram(canvas.nodes, canvas.connections));
                    if (copyActionsContainer) copyActionsContainer.style.display = 'flex';
                    if (window.LCDBridge) window.LCDBridge.onSolved(result, canvas);
                } catch (e) {
                    lastSolutionResult = null;
                    console.error(e);
                    tfOutput.innerHTML = `<span style="color: var(--accent-red); font-size: 13px;">Error: ${e.message}</span>`;
                }
            });
        });
    }

    // Clear Canvas
    clearBtn.addEventListener('click', () => {
        canvas.clear();
        clearMathDisplays();
    });

    // Solve Loop
    solveBtn.addEventListener('click', () => {
        triggerSolve();
    });

    // Handle selection and properties editing
    function handleStateChange() {
        const sel = canvas.selectedElement;
        
        if (sel && sel.type === 'node') {
            const node = canvas.nodes.find(n => n.id === sel.id);
            if (node) {
                propPanel.style.display = 'block';
                noPropMsg.style.display = 'none';
                
                propLabelInput.value = node.label;
                
                if (node.type === 'sum') {
                    propValInput.style.display = 'none';
                    propValLabel.style.display = 'none';
                } else {
                    propValInput.style.display = 'block';
                    propValLabel.style.display = 'block';
                    propValInput.value = node.value;
                    propValLabel.textContent = node.type === 'block' ? 'Transfer Function' : 'Value';
                }
            }
        } else {
            propPanel.style.display = 'none';
            noPropMsg.style.display = 'block';
        }
    }

    // Properties input change handlers
    propLabelInput.addEventListener('input', (e) => {
        const sel = canvas.selectedElement;
        if (sel && sel.type === 'node') {
            canvas.updateNodeLabel(sel.id, e.target.value);
        }
    });

    propValInput.addEventListener('input', (e) => {
        const sel = canvas.selectedElement;
        if (sel && sel.type === 'node') {
            canvas.updateNodeValue(sel.id, e.target.value);
        }
    });

    let lastSolutionResult = null;
    const copyActionsContainer = document.getElementById('copy-actions-container');
    const copyTextBtn = document.getElementById('copy-text-btn');
    const copyLatexBtn = document.getElementById('copy-latex-btn');

    if (copyTextBtn) {
        copyTextBtn.addEventListener('click', () => {
            if (!lastSolutionResult) return;
            const formulaStr = `${currentTfLabel} = ${lastSolutionResult.finalTransferFunction.toFormulaString()}`;
            navigator.clipboard.writeText(formulaStr).then(() => {
                showCopySuccess(copyTextBtn, "Copied Text!");
            });
        });
    }

    if (copyLatexBtn) {
        copyLatexBtn.addEventListener('click', () => {
            if (!lastSolutionResult) return;
            const latexStr = `${lhsLatex(currentTfLabel)} = ${lastSolutionResult.finalTransferFunction.toKaTeX()}`;
            navigator.clipboard.writeText(latexStr).then(() => {
                showCopySuccess(copyLatexBtn, "Copied LaTeX!");
            });
        });
    }

    function showCopySuccess(btn, successText) {
        const originalText = btn.innerHTML;
        btn.innerHTML = successText;
        btn.classList.add('success');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('success');
        }, 1500);
    }

    // Solver logic trigger
    function triggerSolve() {
        try {
            const sourceId = sourceSelect.value;
            const sinkId = sinkSelect.value;
            let result;
            if (sourceId && sinkId) {
                result = transferFunction(canvas.nodes, canvas.connections, sourceId, sinkId);
                const srcLabel = sourceSelect.selectedOptions[0]?.textContent || 'R';
                const sinkLabel = sinkSelect.selectedOptions[0]?.textContent || 'Y';
                currentTfLabel = `${sinkLabel}/${srcLabel}`;
            } else {
                result = solveBlockDiagram(canvas.nodes, canvas.connections);
                currentTfLabel = 'Y/R';
            }
            lastSolutionResult = result;
            renderMathSolution(result, currentTfLabel);
            renderAnalysis(analyzeDiagram(canvas.nodes, canvas.connections));
            if (copyActionsContainer) copyActionsContainer.style.display = 'flex';
            if (window.LCDBridge) window.LCDBridge.onSolved(result, canvas);
        } catch (e) {
            console.error(e);
            lastSolutionResult = null;
            if (window.LCDBridge) window.LCDBridge.onSolveFailed();
            if (copyActionsContainer) copyActionsContainer.style.display = 'none';
            tfOutput.innerHTML = `<span style="color: var(--accent-red); font-size: 13px;">Error: ${e.message}</span>`;
            analysisOutput.innerHTML = `<div style="color: var(--text-secondary); font-size: 12px; font-style: italic;">Could not solve the system. Make sure your nodes are fully connected from the source to the sink.</div>`;
        }
    }

    function clearMathDisplays() {
        lastSolutionResult = null;
        if (copyActionsContainer) copyActionsContainer.style.display = 'none';
        tfOutput.innerHTML = `<span style="color: var(--text-secondary); font-size: 13px;">Diagram solved TF will appear here.</span>`;
        analysisOutput.innerHTML = `<div style="color: var(--text-secondary); font-size: 12px; font-style: italic; text-align: center; margin-top: 40px;">Connect input R to output Y, then solve to see open-loop L(s), closed-loop Y/R, disturbance response and poles.</div>`;
        updateDiagramStats();
    }

    function updateDiagramStats() {
        const blocksCount = canvas.nodes.filter(n => n.type === 'block').length;
        const sumsCount = canvas.nodes.filter(n => n.type === 'sum').length;
        const connsCount = canvas.connections.length;
        
        let loopsCount = 0;
        canvas.connections.forEach(c => {
            const fromNode = canvas.nodes.find(n => n.id === c.fromNode);
            const toNode = canvas.nodes.find(n => n.id === c.toNode);
            if (fromNode && toNode && toNode.x < fromNode.x) {
                loopsCount++;
            }
        });

        const blocksEl = document.getElementById('stats-blocks');
        const sumsEl = document.getElementById('stats-sums');
        const connsEl = document.getElementById('stats-conns');
        const loopsEl = document.getElementById('stats-loops');

        if (blocksEl) blocksEl.textContent = blocksCount;
        if (sumsEl) sumsEl.textContent = sumsCount;
        if (connsEl) connsEl.textContent = connsCount;
        if (loopsEl) loopsEl.textContent = loopsCount;
    }

    function renderMathSolution(result, label = 'Y/R') {
        if (!window.katex) {
            // Safe fallback if CDN fails
            tfOutput.textContent = `${label} = ${result.finalTransferFunction.toFormulaString()}`;
            return;
        }

        // Render the headline transfer function for the selected source/sink.
        const latexStr = `${lhsLatex(label)} = ${result.finalTransferFunction.toKaTeX()}`;
        tfOutput.innerHTML = '';
        const tfContainer = document.createElement('div');
        katex.render(latexStr, tfContainer, { displayMode: true, throwOnError: false });
        tfOutput.appendChild(tfContainer);
    }

    // Render a labelled formula row (KaTeX with a safe text fallback).
    function analysisRow(label, latex) {
        const item = document.createElement('div');
        item.className = 'analysis-item';

        const titleEl = document.createElement('div');
        titleEl.className = 'analysis-label';
        titleEl.textContent = label;
        item.appendChild(titleEl);

        const formulaEl = document.createElement('div');
        formulaEl.className = 'analysis-formula';
        if (window.katex) {
            katex.render(latex, formulaEl, { displayMode: false, throwOnError: false });
        } else {
            formulaEl.textContent = latex;
        }
        item.appendChild(formulaEl);
        return item;
    }

    function analysisNote(label, text, color) {
        const item = document.createElement('div');
        item.className = 'analysis-item';
        const titleEl = document.createElement('div');
        titleEl.className = 'analysis-label';
        titleEl.textContent = label;
        item.appendChild(titleEl);
        const txt = document.createElement('div');
        txt.className = 'analysis-note';
        txt.textContent = text;
        if (color) txt.style.color = color;
        item.appendChild(txt);
        return item;
    }

    // Populate the right-panel System Analysis dashboard.
    function renderAnalysis(a) {
        analysisOutput.innerHTML = '';

        // Open loop L(s)
        if (a.openLoop && a.openLoop.ok) {
            analysisOutput.appendChild(analysisRow('Open loop  L(s)', `L(s) = ${a.openLoop.katex}`));
        } else if (a.openLoop) {
            analysisOutput.appendChild(analysisNote('Open loop  L(s)', a.openLoop.error, 'var(--text-secondary)'));
        }

        // Closed loop Y/R
        if (a.closedLoop && a.closedLoop.ok) {
            analysisOutput.appendChild(analysisRow('Closed loop  Y/R', `\\frac{Y(s)}{R(s)} = ${a.closedLoop.katex}`));
        } else if (a.closedLoop) {
            analysisOutput.appendChild(analysisNote('Closed loop  Y/R', a.closedLoop.error, 'var(--accent-red)'));
        }

        // Disturbance responses Y/D
        a.disturbances.forEach(d => {
            const [, den] = d.label.split('/');
            if (d.ok) {
                analysisOutput.appendChild(analysisRow(`Disturbance  ${d.label}`, `\\frac{Y(s)}{${den}(s)} = ${d.katex}`));
            } else {
                analysisOutput.appendChild(analysisNote(`Disturbance  ${d.label}`, d.error, 'var(--accent-red)'));
            }
        });

        // Characteristic equation, poles, stability
        const c = a.char;
        if (c && c.numeric) {
            analysisOutput.appendChild(analysisRow('Characteristic equation', c.characteristic));

            if (c.poles && c.poles.length) {
                const polesLatex = c.poles.map(p => complexKaTeX(p)).join(',\\ \\ ');
                analysisOutput.appendChild(analysisRow('Poles', polesLatex));
            }
            if (c.zeros && c.zeros.length) {
                const zerosLatex = c.zeros.map(z => complexKaTeX(z)).join(',\\ \\ ');
                analysisOutput.appendChild(analysisRow('Zeros', zerosLatex));
            }

            // Stability verdict badge
            const stabItem = document.createElement('div');
            stabItem.className = 'analysis-item';
            const stabLabel = document.createElement('div');
            stabLabel.className = 'analysis-label';
            stabLabel.textContent = 'Stability';
            stabItem.appendChild(stabLabel);
            const badge = document.createElement('span');
            badge.className = 'stability-badge ' + (c.stable ? 'stable' : 'unstable');
            badge.textContent = c.stable ? '● Stable' : '● Unstable';
            stabItem.appendChild(badge);
            analysisOutput.appendChild(stabItem);

            // Compact metrics row
            const dc = c.dcGain === Infinity ? '∞' : fmtNum(c.dcGain);
            const bits = [`DC gain T(0) = ${dc}`, `Order = ${c.order}`];
            if (c.type !== null && c.type !== undefined) bits.push(`Type = ${c.type}`);
            const metrics = document.createElement('div');
            metrics.className = 'analysis-metrics';
            metrics.textContent = bits.join('   ·   ');
            analysisOutput.appendChild(metrics);
        } else if (a.closedLoop && a.closedLoop.ok) {
            if (c && c.symType !== undefined) {
                const metrics = document.createElement('div');
                metrics.className = 'analysis-metrics';
                metrics.textContent = `Type = ${c.symType}   ·   Order = ${c.symOrder}`;
                analysisOutput.appendChild(metrics);
            }
            analysisOutput.appendChild(analysisNote('Poles & stability',
                'Symbolic diagram — assign numeric values to blocks for pole/stability analysis.',
                'var(--text-secondary)'));
        }

        // Steady-state error
        const ess = a.ess;
        if (ess && ess.ok) {
            analysisOutput.appendChild(sectionDivider('Steady-State Error'));
            const fmt = (e) => e && e.type !== 'unknown' ? e.katex : '?';
            if (ess.reference) {
                analysisOutput.appendChild(essRow('Reference · unit step', `e_{r,ss} = ${fmt(ess.reference.step)}`));
                analysisOutput.appendChild(essRow('Reference · unit ramp', `e_{r,ss} = ${fmt(ess.reference.ramp)}`));
                analysisOutput.appendChild(essRow('Reference · unit parabola', `e_{r,ss} = ${fmt(ess.reference.parabola)}`));
            }
            ess.disturbances.forEach(d => {
                analysisOutput.appendChild(essRow(`Disturbance ${d.label} · unit step`, `e_{d,ss} = ${fmt(d.step)}`));
            });
        } else if (ess && ess.reason) {
            analysisOutput.appendChild(sectionDivider('Steady-State Error'));
            analysisOutput.appendChild(analysisNote('Steady-state error', ess.reason, 'var(--text-secondary)'));
        }
    }

    // A section heading inside the analysis list (e.g. "Steady-State Error").
    function sectionDivider(text) {
        const el = document.createElement('div');
        el.className = 'analysis-divider';
        el.textContent = text;
        return el;
    }

    // A steady-state-error row: a small caption plus the KaTeX result.
    function essRow(caption, latex) {
        const item = document.createElement('div');
        item.className = 'analysis-item ess';
        const cap = document.createElement('div');
        cap.className = 'analysis-label';
        cap.textContent = caption;
        item.appendChild(cap);
        const formulaEl = document.createElement('div');
        formulaEl.className = 'analysis-formula';
        if (window.katex) katex.render(latex, formulaEl, { displayMode: false, throwOnError: false });
        else formulaEl.textContent = latex;
        item.appendChild(formulaEl);
        return item;
    }

    // -------------------------------------------------------------
    // Template library (examples) + local saved diagrams
    // -------------------------------------------------------------
    const diagramStore = createDiagramStore();
    const examplesList = document.getElementById('examples-list');
    const myDiagramsList = document.getElementById('my-diagrams-list');
    const saveDiagramBtn = document.getElementById('save-diagram-btn');

    // In-app replacement for window.prompt (unsupported in Electron). Resolves to
    // the trimmed string on confirm, or null on cancel.
    const promptModal = document.getElementById('prompt-modal');
    const promptTitle = document.getElementById('prompt-title');
    const promptLabel = document.getElementById('prompt-label');
    const promptInput = document.getElementById('prompt-input');
    const promptOk = document.getElementById('prompt-ok-btn');
    const promptCancel = document.getElementById('prompt-cancel-btn');
    const promptCancelX = document.getElementById('prompt-cancel-x');

    function askText({ title = 'Name', label = 'Enter a name', value = '', okText = 'Save' } = {}) {
        return new Promise((resolve) => {
            if (!promptModal) { resolve(null); return; }
            promptTitle.textContent = title;
            promptLabel.textContent = label;
            promptInput.value = value;
            promptOk.textContent = okText;
            promptModal.style.display = 'flex';
            promptInput.focus();
            promptInput.select();

            const cleanup = () => {
                promptModal.style.display = 'none';
                promptOk.removeEventListener('click', onOk);
                promptCancel.removeEventListener('click', onCancel);
                promptCancelX.removeEventListener('click', onCancel);
                promptInput.removeEventListener('keydown', onKey);
                promptModal.removeEventListener('mousedown', onBackdrop);
            };
            const finish = (result) => { cleanup(); resolve(result); };
            const onOk = () => { const v = promptInput.value.trim(); finish(v || null); };
            const onCancel = () => finish(null);
            const onKey = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); onOk(); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            };
            const onBackdrop = (e) => { if (e.target === promptModal) onCancel(); };

            promptOk.addEventListener('click', onOk);
            promptCancel.addEventListener('click', onCancel);
            promptCancelX.addEventListener('click', onCancel);
            promptInput.addEventListener('keydown', onKey);
            promptModal.addEventListener('mousedown', onBackdrop);
        });
    }

    function loadDiagramState(state) {
        clearMathDisplays();
        canvas.loadState(state);
        triggerSolve();
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    }

    function makeTemplateItem(title, subtitle, onClick) {
        const btn = document.createElement('button');
        btn.className = 'template-item';
        btn.innerHTML = `${escapeHtml(title)}<span>${escapeHtml(subtitle)}</span>`;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function renderExamples() {
        if (!examplesList) return;
        examplesList.innerHTML = '';
        for (const group of TEMPLATE_GROUPS) {
            const inGroup = TEMPLATES.filter((t) => t.group === group);
            if (!inGroup.length) continue;
            const label = document.createElement('div');
            label.className = 'template-group-label';
            label.textContent = group;
            examplesList.appendChild(label);
            for (const t of inGroup) {
                examplesList.appendChild(makeTemplateItem(t.name, t.description || '', () => loadDiagramState(t.state)));
            }
        }
    }

    function renderMyDiagrams() {
        if (!myDiagramsList) return;
        myDiagramsList.innerHTML = '';
        const saved = diagramStore.list();
        if (!saved.length) {
            const empty = document.createElement('div');
            empty.className = 'my-diagrams-empty';
            empty.textContent = 'No saved diagrams yet — build one and press Save.';
            myDiagramsList.appendChild(empty);
            return;
        }
        for (const d of saved) {
            const row = document.createElement('div');
            row.className = 'saved-row';

            const open = makeTemplateItem(d.name, 'Saved ' + new Date(d.savedAt).toLocaleString(), () => loadDiagramState(d.state));
            open.classList.add('saved-open');
            row.appendChild(open);

            const ren = document.createElement('button');
            ren.className = 'saved-action';
            ren.title = 'Rename';
            ren.textContent = '✎';
            ren.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const name = await askText({ title: 'Rename diagram', label: 'Diagram name', value: d.name, okText: 'Rename' });
                if (name) { diagramStore.rename(d.id, name); renderMyDiagrams(); }
            });
            row.appendChild(ren);

            const del = document.createElement('button');
            del.className = 'saved-action danger';
            del.title = 'Delete';
            del.textContent = '🗑';
            del.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (window.confirm(`Delete "${d.name}"? This cannot be undone.`)) { diagramStore.remove(d.id); renderMyDiagrams(); }
            });
            row.appendChild(del);

            myDiagramsList.appendChild(row);
        }
    }

    if (saveDiagramBtn) {
        saveDiagramBtn.addEventListener('click', async () => {
            if (!canvas.nodes.length) { window.alert('Nothing to save — the canvas is empty.'); return; }
            const name = await askText({ title: 'Save diagram', label: 'Diagram name', value: 'My diagram', okText: 'Save' });
            if (!name) return;
            diagramStore.save(name, canvas.exportState());
            renderMyDiagrams();
        });
    }

    renderExamples();
    renderMyDiagrams();

    // -------------------------------------------------------------
    // Resizable Right Panel Splitter
    // -------------------------------------------------------------
    const resizeHandle = document.getElementById('right-resize-handle');
    const container = document.querySelector('.app-container');
    
    if (resizeHandle && container) {
        let isResizing = false;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            resizeHandle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const containerRect = container.getBoundingClientRect();
            let newWidth = containerRect.right - e.clientX;
            
            // Constrain width
            newWidth = Math.max(300, Math.min(800, newWidth));
            
            container.style.setProperty('--right-panel-width', `${newWidth}px`);
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                
                // Fire a window resize event to let SVG canvas adjust
                window.dispatchEvent(new Event('resize'));
            }
        });
    }

    // -------------------------------------------------------------
    // Standalone Desktop App Updater (GitHub Git Integration)
    // -------------------------------------------------------------
    const updateSection = document.getElementById('update-section');
    const updateBtn = document.getElementById('update-btn');
    const updateStatusMsg = document.getElementById('update-status-msg');

    // Dynamically show updater only inside Electron standalone window
    if (window.electronAPI) {
        if (updateSection) updateSection.style.display = 'block';

        if (updateBtn) {
            updateBtn.addEventListener('click', () => {
                updateBtn.disabled = true;
                updateBtn.style.opacity = '0.6';
                window.electronAPI.checkUpdate();
            });
        }

        // Receive real-time update execution status logs from Main Process
        window.electronAPI.onUpdateStatus((info) => {
            if (!updateStatusMsg) return;

            updateStatusMsg.textContent = info.message;

            if (info.status === 'checking') {
                updateStatusMsg.style.color = 'var(--accent-blue)';
            } else if (info.status === 'updating') {
                updateStatusMsg.style.color = 'var(--accent-purple)';
            } else if (info.status === 'success') {
                updateStatusMsg.style.color = 'var(--accent-green)';
            } else if (info.status === 'up-to-date') {
                updateStatusMsg.style.color = 'var(--text-secondary)';
                if (updateBtn) {
                    updateBtn.disabled = false;
                    updateBtn.style.opacity = '1';
                }
            } else if (info.status === 'error') {
                updateStatusMsg.style.color = 'var(--accent-red)';
                if (updateBtn) {
                    updateBtn.disabled = false;
                    updateBtn.style.opacity = '1';
                }
            }
        });
    }

    // Global keyboard shortcut for S (Solve) when not typing inside an input element
    window.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const isEditing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!isEditing && e.key.toLowerCase() === 's') {
            e.preventDefault();
            triggerSolve();
        }
    });

    // -------------------------------------------------------------
    // Screenshot Importer & Offline Vision Segmentation Bindings
    // -------------------------------------------------------------
    const visionModal = document.getElementById('vision-modal');
    const openVisionBtn = document.getElementById('open-vision-btn');
    const closeVisionBtn = document.getElementById('close-vision-btn');
    const cancelVisionBtn = document.getElementById('cancel-vision-btn');
    const processVisionBtn = document.getElementById('process-vision-btn');
    const traceBlueprintBtn = document.getElementById('trace-blueprint-btn');
    const removePreviewBtn = document.getElementById('remove-preview-btn');
    const visionDropzone = document.getElementById('vision-dropzone');
    const visionFileInput = document.getElementById('vision-file-input');
    const visionPreviewContainer = document.getElementById('vision-preview-container');
    const visionPreviewImg = document.getElementById('vision-preview-img');
    const visionStatusContainer = document.getElementById('vision-status-container');
    const visionStatusText = document.getElementById('vision-status-text');

    // Canvas Watermark controls
    const canvasBlueprint = document.getElementById('canvas-blueprint');
    const blueprintControls = document.getElementById('blueprint-controls');
    const blueprintOpacity = document.getElementById('blueprint-opacity');
    const clearBlueprintBtn = document.getElementById('clear-blueprint-btn');

    let loadedImage = null;

    function openModal() {
        if (visionModal) {
            visionModal.style.display = 'flex';
            resetModal();
        }
    }

    function closeModal() {
        if (visionModal) visionModal.style.display = 'none';
    }

    function resetModal() {
        loadedImage = null;
        if (visionFileInput) visionFileInput.value = '';
        if (visionPreviewImg) visionPreviewImg.src = '';
        if (visionPreviewContainer) visionPreviewContainer.style.display = 'none';
        if (visionDropzone) visionDropzone.style.display = 'flex';
        if (visionStatusContainer) visionStatusContainer.style.display = 'none';
        if (processVisionBtn) processVisionBtn.disabled = true;
        if (traceBlueprintBtn) traceBlueprintBtn.disabled = true;
    }

    if (openVisionBtn) openVisionBtn.addEventListener('click', openModal);
    if (closeVisionBtn) closeVisionBtn.addEventListener('click', closeModal);
    if (cancelVisionBtn) cancelVisionBtn.addEventListener('click', closeModal);
    if (removePreviewBtn) removePreviewBtn.addEventListener('click', resetModal);

    // Browse files
    if (visionDropzone) {
        visionDropzone.addEventListener('click', () => {
            if (visionFileInput) visionFileInput.click();
        });

        // Drag & Drop
        visionDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            visionDropzone.classList.add('dragover');
        });

        visionDropzone.addEventListener('dragleave', () => {
            visionDropzone.classList.remove('dragover');
        });

        visionDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            visionDropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });
    }

    if (visionFileInput) {
        visionFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFile(file);
        });
    }

    // Direct paste support monitor
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                handleFile(blob);
                openModal();
                e.preventDefault();
                break;
            }
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (visionPreviewImg) visionPreviewImg.src = event.target.result;
            if (visionPreviewContainer) visionPreviewContainer.style.display = 'block';
            if (visionDropzone) visionDropzone.style.display = 'none';
            if (processVisionBtn) processVisionBtn.disabled = false;
            if (traceBlueprintBtn) traceBlueprintBtn.disabled = false;

            const img = new Image();
            img.onload = () => {
                loadedImage = img;
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Blueprint Watermark Hooks
    if (traceBlueprintBtn) {
        traceBlueprintBtn.addEventListener('click', () => {
            if (!loadedImage) return;

            // Store image DataURL directly on canvas instance for persistent rendering
            const imgDataUrl = visionPreviewImg.src;
            canvas.blueprintImgData = imgDataUrl;
            canvas.blueprintOpacity = 0.25;
            // Anchor at the image's natural aspect ratio so it isn't stretched.
            canvas.fitBlueprint(loadedImage.width, loadedImage.height);
            canvas.render();

            if (blueprintControls) {
                blueprintControls.style.display = 'flex';
            }
            if (blueprintOpacity) {
                blueprintOpacity.value = 25;
            }

            closeModal();
        });
    }

    if (blueprintOpacity) {
        blueprintOpacity.addEventListener('input', (e) => {
            canvas.blueprintOpacity = e.target.value / 100;
            canvas.render();
        });
    }

    if (clearBlueprintBtn) {
        clearBlueprintBtn.addEventListener('click', () => {
            canvas.blueprintImgData = null;
            canvas.render();
            if (blueprintControls) {
                blueprintControls.style.display = 'none';
            }
        });
    }

    if (processVisionBtn) {
        processVisionBtn.addEventListener('click', () => {
            if (!loadedImage) return;

            processVisionBtn.disabled = true;
            if (visionStatusContainer) {
                visionStatusContainer.style.display = 'block';
                visionStatusText.textContent = "Tracing closed shapes and wires...";
            }

            setTimeout(() => {
                try {
                    const canvasWidth = loadedImage.width;
                    const canvasHeight = loadedImage.height;

                    const offscreen = document.createElement('canvas');
                    offscreen.width = canvasWidth;
                    offscreen.height = canvasHeight;
                    const oCtx = offscreen.getContext('2d');
                    oCtx.drawImage(loadedImage, 0, 0, canvasWidth, canvasHeight);

                    const imgData = oCtx.getImageData(0, 0, canvasWidth, canvasHeight);

                    // Run the 100% Offline Topology Engine
                    const result = analyzeImageTopology(imgData.data, canvasWidth, canvasHeight);

                    // Draw layout as editable Proposals on the interactive canvas!
                    injectProposals(result, canvasWidth, canvasHeight);

                    closeModal();
                } catch (err) {
                    console.error(err);
                    alert("Diagram parsing error: " + err.message);
                    if (processVisionBtn) processVisionBtn.disabled = false;
                    if (visionStatusContainer) visionStatusContainer.style.display = 'none';
                }
            }, 100);
        });
    }

    function injectProposals(result, origW, origH) {
        canvas.clear();
        clearMathDisplays();

        // Fit diagram onto our 1200x600 grid dynamically maintaining aspect ratio
        const targetW = 1100;
        const targetH = 500;
        const scaleX = targetW / origW;
        const scaleY = targetH / origH;
        const scale = Math.min(scaleX, scaleY) * 0.9; // shrink slightly for padding

        const offsetX = (1200 - origW * scale) / 2;
        const offsetY = (600 - origH * scale) / 2;

        const idMap = {};
        let blockIdx = 1;
        let feedbackIdx = 1;

        // 1. Create dangling Input / Output terminal nodes
        result.terminals.forEach(t => {
            const tx = Math.round(t.x * scale + offsetX);
            const ty = Math.round(t.y * scale + offsetY);

            if (t.type === 'input') {
                const node = canvas.addNode('input', tx, ty, '1', 'R');
                idMap[t.id] = node.id;
            } else {
                const node = canvas.addNode('output', tx, ty, '1', 'Y');
                idMap[t.id] = node.id;
            }
        });

        // 2. Identify Feedback vs Feedforward Blocks based on spatial vertical offset
        let termYSum = 0;
        result.terminals.forEach(t => termYSum += t.y);
        const averageTermY = result.terminals.length > 0 ? (termYSum / result.terminals.length) : (origH / 2);

        // Create other shapes (Sum Junctions & Blocks)
        result.shapes.forEach(s => {
            const cx = (s.minX + s.maxX) / 2;
            const cy = (s.minY + s.maxY) / 2;

            const tx = Math.round(cx * scale + offsetX);
            const ty = Math.round(cy * scale + offsetY);

            if (s.type === 'sum') {
                const node = canvas.addNode('sum', tx, ty, '', 'Σ');
                idMap[s.id] = node.id;
            } else {
                // If it is positioned significantly below the main signal level, classify as a feedback loop element
                const isFeedback = cy > (averageTermY + 30);
                
                let label = "";
                let dir = "right";
                if (isFeedback) {
                    label = `H${feedbackIdx++}`;
                    dir = "left"; // Set direction leftward for feedback block loop alignment
                } else {
                    label = `G${blockIdx++}`;
                    dir = "right";
                }

                const node = canvas.addNode('block', tx, ty, 'G(s)', label);
                node.direction = dir;
                idMap[s.id] = node.id;
            }
        });

        // 3. Inject snaps and collinear connection trees
        result.connections.forEach(c => {
            const fromCanvasId = idMap[c.fromNode];
            const toCanvasId = idMap[c.toNode];

            if (fromCanvasId && toCanvasId) {
                canvas.connections.push({
                    id: canvas.generateId('conn'),
                    fromNode: fromCanvasId,
                    toNode: toCanvasId,
                    sign: c.sign || ''
                });
            }
        });

        canvas.render();
        updateDiagramStats();
        triggerSolve();
    }

    // Load a standard feedback loop on initial start to instantly demonstrate features
    const defaultTemplate = TEMPLATES.find((t) => t.id === 'sensor-fb') || TEMPLATES[0];
    if (defaultTemplate) loadDiagramState(defaultTemplate.state);
});
