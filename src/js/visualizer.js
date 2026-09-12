/* ============================================
   visualizer.js
   Dynamic UI Visualizer
   Updates registers, memory, pipeline, assembly,
   and console output in real-time
   ============================================ */

class Visualizer {
    constructor(arch) {
        this.arch = arch;
        this.codeGen = null;
        this.currentInstrIndex = -1;
        this.lastModifiedRegs = new Set();
        this.lastModifiedMem = new Set();
        this.memMode = 'stack';
        this.regCache = new Map();
        this.isArm = arch.name === 'arm32' || arch.name === 'arm64';

        this.elements = {
            assemblyView: document.getElementById('assembly-view'),
            registersView: document.getElementById('registers-view'),
            memoryView: document.getElementById('memory-view'),
            pipelineView: document.getElementById('pipeline-view'),
            consoleOutput: document.getElementById('console-output'),
            stageFetch: document.getElementById('stage-fetch'),
            stageDecode: document.getElementById('stage-decode'),
            stageExecute: document.getElementById('stage-execute'),
            stageMemory: document.getElementById('stage-memory'),
            stageWriteback: document.getElementById('stage-writeback'),
            statusText: document.getElementById('status-text'),
            cycleCount: document.getElementById('cycle-count'),
            instructionCount: document.getElementById('instruction-count'),
            pcDisplay: document.getElementById('pc-display'),
            asmTitle: document.getElementById('asm-title'),
            asmArchLabel: document.getElementById('asm-arch-label'),
            regCount: document.getElementById('reg-count'),
        };
    }

    setArchitecture(arch) {
        this.arch = arch;
        this.isArm = arch.name === 'arm32' || arch.name === 'arm64';
        this.regCache.clear();
        this.elements.asmArchLabel.textContent = arch.displayName;
        this.elements.regCount.textContent = `${arch.registers.length} registers`;
    }

    setCodeGen(codeGen) {
        this.codeGen = codeGen;
    }

    // ============================================
    // Assembly View
    // ============================================
    renderAssembly(instructions, currentIndex) {
        if (!instructions || instructions.length === 0) {
            this.elements.assemblyView.innerHTML = '<div class="asm-placeholder">No assembly to display</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < instructions.length; i++) {
            const instr = instructions[i];
            const isCurrent = i === currentIndex;
            const cls = `asm-instruction${isCurrent ? ' current' : ''}`;

            if (instr.label) {
                html += `<div class="asm-label">${instr.label}:</div>`;
            }

            const addrStr = `0x${instr.address.toString(16).toUpperCase().padStart(8, '0')}`;
            const formatted = this.codeGen ? this.codeGen.formatInstruction(instr) : `${instr.opcode}`;
            const parts = formatted.split(/\s+(.*)/);
            const mnemonic = parts[0] || instr.opcode;
            const operands = parts[1] || '';

            html += `<div class="${cls}" data-index="${i}">`;
            html += `<span class="asm-addr">${addrStr}</span>`;
            html += `<span class="asm-mnemonic">${mnemonic}</span>`;
            html += `<span class="asm-operands">${operands}</span>`;
            if (instr.comment) {
                html += `<span class="asm-comment">${this.arch.commentChar} ${instr.comment}</span>`;
            }
            html += `</div>`;
        }

        this.elements.assemblyView.innerHTML = html;

        if (currentIndex >= 0) {
            const currentEl = this.elements.assemblyView.querySelector('.asm-instruction.current');
            if (currentEl) {
                currentEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    highlightCurrentInstruction(index) {
        const allInstrs = this.elements.assemblyView.querySelectorAll('.asm-instruction');
        allInstrs.forEach(el => el.classList.remove('current'));
        if (index >= 0 && index < allInstrs.length) {
            const el = allInstrs[index];
            if (el) {
                el.classList.add('current');
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    // ============================================
    // Registers View
    // ============================================
    renderRegisters(registers, modifiedRegs, flags) {
        let html = '';
        const modified = modifiedRegs || new Set();

        for (const reg of this.arch.registers) {
            const value = registers[reg.name] || 0;
            const isModified = modified.has(reg.name);
            const wasModified = this.lastModifiedRegs.has(reg.name);
            let cls = 'register-item';
            if (reg.role === 'pc') cls += ' pc';
            if (reg.role === 'sp') cls += ' sp';
            if (reg.role === 'bp') cls += ' sp';
            if (isModified) cls += ' modified';

            const hexWidth = reg.size * 2;
            let displayVal;
            if (typeof value === 'bigint') {
                displayVal = `0x${value.toString(16).toUpperCase().padStart(hexWidth, '0')}`;
            } else if (reg.size === 8 && value > 0xFFFFFFFF) {
                displayVal = `0x${value.toString(16).toUpperCase().padStart(hexWidth, '0')}`;
            } else {
                displayVal = `0x${(value >>> 0).toString(16).toUpperCase().padStart(hexWidth, '0')}`;
            }

            if (reg.role === 'flags') {
                const flagStr = flags ? `Z:${flags.Z} N:${flags.N} C:${flags.C} V:${flags.V}` : displayVal;
                html += `<div class="${cls}" title="${reg.desc}">`;
                html += `<span class="register-name">${reg.name}</span>`;
                html += `<span class="register-value">${flagStr}</span>`;
                html += `<span class="register-desc">${reg.desc}</span>`;
                html += `</div>`;
            } else {
                html += `<div class="${cls}" title="${reg.desc}">`;
                html += `<span class="register-name">${reg.name}</span>`;
                html += `<span class="register-value">${displayVal}</span>`;
                html += `<span class="register-desc">${reg.desc}</span>`;
                html += `</div>`;
            }
        }

        this.elements.registersView.innerHTML = html;
        this.lastModifiedRegs = new Set(modified);
    }

    // ============================================
    // Memory View
    // ============================================
    renderMemory(cpu, modifiedMem) {
        let rows;
        let sectionLabel = '';

        if (this.memMode === 'stack') {
            rows = cpu.dumpStack();
            sectionLabel = 'STACK';
        } else if (this.memMode === 'heap') {
            rows = cpu.dumpHeap();
            sectionLabel = 'HEAP';
        } else {
            rows = cpu.dumpData();
            sectionLabel = 'DATA';
        }

        if (rows.length === 0) {
            this.elements.memoryView.innerHTML = `<div style="padding:12px;color:var(--text-muted);">No ${sectionLabel.toLowerCase()} memory to display</div>`;
            return;
        }

        let html = `<div class="mem-section-label">${sectionLabel}</div>`;
        for (const row of rows) {
            const addrStr = `0x${row.addr.toString(16).toUpperCase()}`;
            let hexStr = '';
            for (const b of row.bytes) {
                if (b.value !== null) {
                    const isMod = modifiedMem && modifiedMem.has(b.addr);
                    const byteStr = b.value.toString(16).toUpperCase().padStart(2, '0');
                    hexStr += `<span class="${isMod ? 'mem-byte-modified' : ''}">${byteStr}</span> `;
                } else {
                    hexStr += `.. `;
                }
            }
            html += `<div class="mem-row">`;
            html += `<span class="mem-addr">${addrStr}</span>`;
            html += `<span class="mem-hex">${hexStr.trim()}</span>`;
            html += `<span class="mem-ascii">${row.ascii}</span>`;
            html += `</div>`;
        }

        this.elements.memoryView.innerHTML = html;
    }

    setMemMode(mode) {
        this.memMode = mode;
    }

    // ============================================
    // Pipeline View
    // ============================================
    renderPipeline(pipeline) {
        if (!pipeline) {
            this.elements.stageFetch.textContent = '-';
            this.elements.stageDecode.textContent = '-';
            this.elements.stageExecute.textContent = '-';
            this.elements.stageMemory.textContent = '-';
            this.elements.stageWriteback.textContent = '-';

            document.querySelectorAll('.pipeline-stage').forEach(el => el.classList.remove('active'));
            return;
        }

        this.elements.stageFetch.textContent = pipeline.fetch || '-';
        this.elements.stageDecode.textContent = pipeline.decode || '-';
        this.elements.stageExecute.textContent = pipeline.execute || '-';
        this.elements.stageMemory.textContent = pipeline.memory || '-';
        this.elements.stageWriteback.textContent = pipeline.writeback || '-';

        const stages = ['fetch', 'decode', 'execute', 'memory', 'writeback'];
        for (const stage of stages) {
            const el = document.querySelector(`.pipeline-stage[data-stage="${stage}"]`);
            if (el) {
                if (pipeline[stage] && pipeline[stage] !== '-') {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        }
    }

    // ============================================
    // Console Output
    // ============================================
    appendConsole(text, type) {
        const line = document.createElement('div');
        line.className = `console-line ${type || ''}`;
        line.textContent = text;
        this.elements.consoleOutput.appendChild(line);
        this.elements.consoleOutput.scrollTop = this.elements.consoleOutput.scrollHeight;
    }

    clearConsole() {
        this.elements.consoleOutput.innerHTML = '';
    }

    // ============================================
    // Status Bar
    // ============================================
    updateStatus(status, cpu) {
        if (status) {
            this.elements.statusText.textContent = status;
        }
        if (cpu) {
            this.elements.cycleCount.textContent = `Cycles: ${cpu.cycles}`;
            this.elements.instructionCount.textContent = `Instructions: ${cpu.executedCount}`;
            const pcVal = typeof cpu.pc === 'number' ? cpu.pc : Number(cpu.pc);
            this.elements.pcDisplay.textContent = `PC: 0x${pcVal.toString(16).toUpperCase().padStart(8, '0')}`;
        }
    }

    // ============================================
    // Full Update
    // ============================================
    update(cpu, stepResult) {
        const modifiedRegs = stepResult ? new Set(stepResult.modifiedRegs) : new Set();
        const modifiedMem = stepResult ? new Set(stepResult.modifiedMem) : new Set();

        try {
            this.renderRegisters(cpu.registers, modifiedRegs, cpu.flags);
            this.renderMemory(cpu, new Set(modifiedMem));
            this.renderPipeline(stepResult ? stepResult.pipeline : null);
            if (cpu.instructionIndex >= 0 && cpu.instructionIndex < this.elements.assemblyView.querySelectorAll('.asm-instruction').length) {
                this.highlightCurrentInstruction(cpu.instructionIndex);
            }
            this.updateStatus(null, cpu);

            if (stepResult && stepResult.halted) {
                for (const out of cpu.output) {
                    this.appendConsole(out.text, out.type);
                }
            }
        } catch (err) {
            console.error('Visualizer update error:', err);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Visualizer };
}
