/* ============================================
   cpu-diagram.js
   Animated CPU Schematic Diagram
   SVG-based visualization of CPU internals:
   PC, IR, ALU, Register File, Control Unit,
   Memory Bus, with live data flow animation
   ============================================ */

class CPUDiagram {
    constructor(arch) {
        this.arch = arch;
        this.container = null;
        this.svg = null;
        this.codeGen = null;
        this.isArm = arch.name === 'arm32' || arch.name === 'arm64';

        this.regFileOpen = false;
        this.activeComponent = null;

        this.SVG_NS = 'http://www.w3.org/2000/svg';
        this.W = 560;
        this.H = 360;

        this.componentColors = {
            idle: '#313244',
            active: '#89b4fa',
            alu: '#a6e3a1',
            mem: '#94e2d5',
            ctrl: '#f9e2af',
            pc: '#f38ba8',
            ir: '#cba6f7',
            reg: '#fab387',
            bus: '#45475a',
            busActive: '#89b4fa',
            text: '#cdd6f4',
            textDim: '#6c7086',
            bg: '#181825',
            border: '#45475a',
        };
    }

    setArchitecture(arch) {
        this.arch = arch;
        this.isArm = arch.name === 'arm32' || arch.name === 'arm64';
        if (this.container) this.render();
    }

    setCodeGen(codeGen) {
        this.codeGen = codeGen;
    }

    mount(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.render();
    }

    // ============================================
    // SVG helpers
    // ============================================
    el(tag, attrs, text) {
        const e = document.createElementNS(this.SVG_NS, tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                e.setAttribute(k, v);
            }
        }
        if (text !== undefined) {
            e.textContent = text;
        }
        return e;
    }

    rect(x, y, w, h, rx, fill, stroke, sw, id) {
        return this.el('rect', {
            x, y, width: w, height: h,
            rx: rx || 4,
            fill: fill || this.componentColors.idle,
            stroke: stroke || this.componentColors.border,
            'stroke-width': sw || 1.5,
            id: id || undefined,
        });
    }

    text(x, y, str, size, fill, anchor, weight) {
        return this.el('text', {
            x, y,
            'font-family': 'monospace',
            'font-size': size || 11,
            fill: fill || this.componentColors.text,
            'text-anchor': anchor || 'middle',
            'font-weight': weight || 'normal',
        }, str);
    }

    line(x1, y1, x2, y2, stroke, sw, dash, id) {
        return this.el('line', {
            x1, y1, x2, y2,
            stroke: stroke || this.componentColors.bus,
            'stroke-width': sw || 2,
            'stroke-dasharray': dash || undefined,
            id: id || undefined,
        });
    }

    path(d, stroke, sw, fill, dash, id) {
        return this.el('path', {
            d,
            stroke: stroke || this.componentColors.bus,
            'stroke-width': sw || 2,
            fill: fill || 'none',
            'stroke-dasharray': dash || undefined,
            id: id || undefined,
        });
    }

    // ============================================
    // Render full diagram
    // ============================================
    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        const svg = this.el('svg', {
            viewBox: `0 0 ${this.W} ${this.H}`,
            width: '100%',
            height: '100%',
            style: 'display:block;',
        });
        this.svg = svg;

        // Background
        svg.appendChild(this.rect(0, 0, this.W, this.H, 0, this.componentColors.bg, 'none', 0));

        // Bus lines (drawn first, behind components)
        this.renderBuses(svg);

        // CPU boundary
        const cpuBox = this.rect(8, 8, this.W - 16, this.H - 16, 8,
            'rgba(49,50,68,0.3)', this.componentColors.border, 2, 'cpu-boundary');
        cpuBox.setAttribute('rx', 8);
        svg.appendChild(cpuBox);
        svg.appendChild(this.text(this.W / 2, 22, this.arch.displayName.toUpperCase(), 10,
            this.componentColors.textDim, 'middle', '600'));

        // Control Unit (top center)
        this.renderControlUnit(svg);

        // PC (left)
        this.renderPC(svg);

        // IR (left, below PC)
        this.renderIR(svg);

        // ALU (center)
        this.renderALU(svg);

        // Register File (right)
        this.renderRegFile(svg);

        // Memory (bottom)
        this.renderMemory(svg);

        // Bus labels
        this.renderBusLabels(svg);

        this.container.appendChild(svg);
    }

    renderBuses(svg) {
        // Main data bus (horizontal, connecting PC->ALU->RegFile)
        const busY = 165;
        svg.appendChild(this.line(100, busY, 440, busY, this.componentColors.bus, 3, null, 'bus-data'));
        svg.appendChild(this.line(100, busY - 3, 440, busY - 3, this.componentColors.bus, 1, '2,3', 'bus-data-shadow'));

        // Control bus (from Control Unit downward)
        svg.appendChild(this.path('M 280 75 L 280 100 L 120 100 L 120 130',
            this.componentColors.bus, 2, 'none', '3,3', 'bus-ctrl-left'));
        svg.appendChild(this.path('M 280 75 L 280 100 L 430 100 L 430 130',
            this.componentColors.bus, 2, 'none', '3,3', 'bus-ctrl-right'));
        svg.appendChild(this.path('M 280 75 L 280 165',
            this.componentColors.bus, 2, 'none', '3,3', 'bus-ctrl-alu'));

        // Memory bus (from bottom of CPU to memory)
        svg.appendChild(this.line(280, 280, 280, 310,
            this.componentColors.bus, 3, null, 'bus-mem'));

        // PC to bus connection
        svg.appendChild(this.line(60, 130, 60, 165, this.componentColors.bus, 2, null, 'bus-pc'));
        svg.appendChild(this.line(60, 165, 100, 165, this.componentColors.bus, 2, null, 'bus-pc-h'));

        // IR to bus connection
        svg.appendChild(this.line(60, 200, 60, 165, this.componentColors.bus, 2, null, 'bus-ir'));

        // RegFile to bus
        svg.appendChild(this.line(430, 200, 430, 165, this.componentColors.bus, 2, null, 'bus-reg'));
        svg.appendChild(this.line(430, 165, 440, 165, this.componentColors.bus, 2, null, 'bus-reg-h'));

        // ALU to bus (ALU sits on the bus)
        svg.appendChild(this.line(200, 165, 360, 165, this.componentColors.bus, 2, null, 'bus-alu'));
    }

    renderBusLabels(svg) {
        svg.appendChild(this.text(250, 159, 'Data Bus', 8, this.componentColors.textDim, 'middle', '400'));
        svg.appendChild(this.text(295, 97, 'Control Bus', 8, this.componentColors.textDim, 'middle', '400'));
        svg.appendChild(this.text(300, 300, 'Memory Bus', 8, this.componentColors.textDim, 'middle', '400'));
    }

    renderPC(svg) {
        const g = this.el('g', { id: 'comp-pc' });
        g.appendChild(this.rect(20, 40, 80, 50, 6, this.componentColors.idle, this.componentColors.pc, 2, 'pc-box'));
        g.appendChild(this.text(60, 56, 'PC', 13, this.componentColors.pc, 'middle', '700'));
        g.appendChild(this.text(60, 80, '0x00000000', 10, this.componentColors.text, 'middle', '400', 'pc-val'));
        svg.appendChild(g);
    }

    renderIR(svg) {
        const g = this.el('g', { id: 'comp-ir' });
        g.appendChild(this.rect(20, 110, 80, 50, 6, this.componentColors.idle, this.componentColors.ir, 2, 'ir-box'));
        g.appendChild(this.text(60, 126, 'IR', 13, this.componentColors.ir, 'middle', '700'));
        g.appendChild(this.text(60, 150, 'NOP', 9, this.componentColors.text, 'middle', '400', 'ir-val'));
        svg.appendChild(g);
    }

    renderControlUnit(svg) {
        const g = this.el('g', { id: 'comp-cu' });
        const w = 110, h = 45;
        const x = 280 - w / 2, y = 30;
        g.appendChild(this.rect(x, y, w, h, 6, this.componentColors.idle, this.componentColors.ctrl, 2, 'cu-box'));
        g.appendChild(this.text(x + w / 2, y + 18, 'Control Unit', 11, this.componentColors.ctrl, 'middle', '700'));
        g.appendChild(this.text(x + w / 2, y + 36, 'IDLE', 9, this.componentColors.textDim, 'middle', '400', 'cu-state'));
        svg.appendChild(g);
    }

    renderALU(svg) {
        const g = this.el('g', { id: 'comp-alu' });
        const cx = 280, cy = 200;
        const w = 120, h = 60;
        const x = cx - w / 2, y = cy - h / 2;

        // ALU trapezoid shape
        const d = `M ${x} ${y} L ${x + w} ${y} L ${x + w - 15} ${y + h} L ${x + 15} ${y + h} Z`;
        g.appendChild(this.el('path', {
            d,
            fill: this.componentColors.idle,
            stroke: this.componentColors.alu,
            'stroke-width': 2,
            id: 'alu-box',
        }));
        g.appendChild(this.text(cx, y + 22, 'ALU', 14, this.componentColors.alu, 'middle', '700'));
        g.appendChild(this.text(cx, y + 42, '-', 9, this.componentColors.textDim, 'middle', '400', 'alu-op'));

        // Input A / B labels
        g.appendChild(this.text(x + 8, y + 14, 'A', 8, this.componentColors.textDim, 'middle', '600'));
        g.appendChild(this.text(x + w - 8, y + 14, 'B', 8, this.componentColors.textDim, 'middle', '600'));

        svg.appendChild(g);
    }

    renderRegFile(svg) {
        const g = this.el('g', { id: 'comp-regs' });
        const x = 370, y = 110, w = 110, h = 110;
        g.appendChild(this.rect(x, y, w, h, 6, this.componentColors.idle, this.componentColors.reg, 2, 'rf-box'));
        g.appendChild(this.text(x + w / 2, y + 16, 'Register File', 10, this.componentColors.reg, 'middle', '700'));

        // Show top 4 registers
        const regs = this.arch.registers.slice(0, 5);
        const rowH = 16;
        const startY = y + 24;
        for (let i = 0; i < regs.length; i++) {
            const reg = regs[i];
            const ry = startY + i * rowH;
            g.appendChild(this.text(x + 8, ry + 11, reg.name, 9,
                this.componentColors.textDim, 'start', '500', `rf-name-${i}`));
            g.appendChild(this.text(x + w - 8, ry + 11, '0x00000000', 9,
                this.componentColors.text, 'end', '400', `rf-val-${i}`));
            if (i < 4) {
                g.appendChild(this.line(x + 6, ry + rowH, x + w - 6, ry + rowH,
                    this.componentColors.border, 0.5));
            }
        }
        g.appendChild(this.text(x + w / 2, y + h - 4, `+${this.arch.registers.length - 5} more`, 7,
            this.componentColors.textDim, 'middle', '400'));

        svg.appendChild(g);
    }

    renderMemory(svg) {
        const g = this.el('g', { id: 'comp-mem' });
        const x = 200, y = 310, w = 160, h = 38;
        g.appendChild(this.rect(x, y, w, h, 6, this.componentColors.idle, this.componentColors.mem, 2, 'mem-box'));
        g.appendChild(this.text(x + 35, y + 16, 'Memory', 10, this.componentColors.mem, 'middle', '700'));
        g.appendChild(this.text(x + 35, y + 30, 'Stack/Heap', 8, this.componentColors.textDim, 'middle', '400'));

        // Mini memory grid
        const gridX = x + 70, gridY = y + 6;
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 6; col++) {
                const bx = gridX + col * 13;
                const by = gridY + row * 13;
                g.appendChild(this.rect(bx, by, 11, 11, 2,
                    'rgba(148,226,213,0.1)', this.componentColors.border, 0.5, `mem-cell-${row}-${col}`));
            }
        }

        svg.appendChild(g);
    }

    // ============================================
    // Animation: activate a component
    // ============================================
    activateComponent(id, color) {
        if (!this.svg) return;
        const box = this.svg.querySelector(`#${id}`);
        if (box) {
            box.setAttribute('fill', color || this.componentColors.active);
            box.setAttribute('stroke-opacity', '1');
        }
    }

    deactivateComponent(id) {
        if (!this.svg) return;
        const box = this.svg.querySelector(`#${id}`);
        if (box) {
            box.setAttribute('fill', this.componentColors.idle);
        }
    }

    deactivateAll() {
        const ids = ['pc-box', 'ir-box', 'cu-box', 'alu-box', 'rf-box', 'mem-box'];
        for (const id of ids) {
            this.deactivateComponent(id);
        }
        // Reset bus colors
        const buses = ['bus-data', 'bus-ctrl-left', 'bus-ctrl-right', 'bus-ctrl-alu', 'bus-mem',
                       'bus-pc', 'bus-pc-h', 'bus-ir', 'bus-reg', 'bus-reg-h', 'bus-alu'];
        for (const id of buses) {
            const b = this.svg.querySelector(`#${id}`);
            if (b) b.setAttribute('stroke', this.componentColors.bus);
        }
        // Reset state text
        const cuState = this.svg.querySelector('#cu-state');
        if (cuState) { cuState.textContent = 'IDLE'; cuState.setAttribute('fill', this.componentColors.textDim); }
        const aluOp = this.svg.querySelector('#alu-op');
        if (aluOp) { aluOp.textContent = '-'; aluOp.setAttribute('fill', this.componentColors.textDim); }
    }

    activateBus(busId) {
        if (!this.svg) return;
        const b = this.svg.querySelector(`#${busId}`);
        if (b) {
            b.setAttribute('stroke', this.componentColors.busActive);
            b.setAttribute('stroke-width', '3');
        }
    }

    // ============================================
    // Update diagram from CPU state
    // ============================================
    update(cpu, stepResult) {
        if (!this.svg || !cpu) return;

        this.deactivateAll();

        const instr = stepResult ? stepResult.instr : null;
        const op = instr ? instr.opcode : '';

        // Update PC value
        const pcVal = this.svg.querySelector('#pc-val');
        if (pcVal) {
            const pc = cpu.getReg(this.arch.pcRegister);
            pcVal.textContent = '0x' + pc.toString(16).toUpperCase().padStart(this.arch.bits / 4, '0');
        }

        // Update IR value
        const irVal = this.svg.querySelector('#ir-val');
        if (irVal && instr) {
            const formatted = this.codeGen ? this.codeGen.formatInstruction(instr) : op;
            irVal.textContent = formatted.length > 12 ? formatted.substring(0, 11) + '..' : formatted;
        }

        // Update register file display
        const regs = this.arch.registers.slice(0, 5);
        for (let i = 0; i < regs.length; i++) {
            const valEl = this.svg.querySelector(`#rf-val-${i}`);
            if (valEl) {
                const val = cpu.getReg(regs[i].name);
                const hexW = regs[i].size * 2;
                let display;
                if (regs[i].size === 8 && val > 0xFFFFFFFF) {
                    display = '0x' + val.toString(16).toUpperCase().padStart(hexW, '0');
                } else {
                    display = '0x' + (val >>> 0).toString(16).toUpperCase().padStart(hexW, '0');
                }
                valEl.textContent = display;
            }
        }

        // Determine active stage and animate
        if (!instr) return;

        const modifiedRegs = stepResult ? new Set(stepResult.modifiedRegs) : new Set();
        const modifiedMem = stepResult ? new Set(stepResult.modifiedMem) : new Set();
        const pipeline = stepResult ? stepResult.pipeline : null;

        // Activate based on instruction type
        const isMemRead = op === 'MOV' && instr.operands[1] && instr.operands[1].type === 'mem';
        const isMemWrite = op === 'MOV' && instr.operands[0] && instr.operands[0].type === 'mem';
        const isMemOp = isMemRead || isMemWrite || op === 'PUSH' || op === 'POP' || op === 'LDR' || op === 'STR' || op === 'STP' || op === 'LDP';
        const isAluOp = ['ADD', 'SUB', 'MUL', 'IMUL', 'DIV', 'IDIV', 'AND', 'OR', 'ORR', 'XOR', 'EOR',
                         'SHL', 'SHR', 'LSL', 'LSR', 'NEG', 'NOT', 'INC', 'DEC', 'CMP', 'CMN', 'TST'].includes(op);
        const isBranch = ['JMP', 'B', 'JE', 'JNE', 'JL', 'JG', 'JLE', 'JGE', 'BEQ', 'BNE', 'BLT', 'BGT', 'BLE', 'BGE',
                          'B_EQ', 'B_NE', 'B_LT', 'B_GT', 'B_LE', 'B_GE'].includes(op);
        const isCall = op === 'CALL' || op === 'BL';
        const isRet = op === 'RET' || op === 'BX' || op === 'BR';

        // Control Unit always active during execution
        this.activateComponent('cu-box', this.componentColors.ctrl);
        const cuState = this.svg.querySelector('#cu-state');
        if (cuState) {
            let stateText = 'DECODING';
            if (isAluOp) stateText = 'ALU OP';
            else if (isMemOp) stateText = 'MEM OP';
            else if (isBranch) stateText = 'BRANCH';
            else if (isCall) stateText = 'CALL';
            else if (isRet) stateText = 'RETURN';
            else if (op === 'MOV') stateText = 'DATA MOVE';
            else if (op === 'NOP') stateText = 'NOP';
            else if (op === 'HLT') stateText = 'HALT';
            cuState.textContent = stateText;
            cuState.setAttribute('fill', this.componentColors.ctrl);
        }

        // PC active on branch/call/ret
        if (isBranch || isCall || isRet || op === 'HLT') {
            this.activateComponent('pc-box', this.componentColors.pc);
        } else {
            this.activateComponent('pc-box', 'rgba(243,139,168,0.15)');
        }

        // IR always shows current instruction
        this.activateComponent('ir-box', 'rgba(203,166,247,0.15)');

        // ALU activation
        if (isAluOp) {
            this.activateComponent('alu-box', this.componentColors.alu);
            const aluOpEl = this.svg.querySelector('#alu-op');
            if (aluOpEl) {
                const opMap = { 'ADD': '+', 'SUB': '−', 'MUL': '×', 'IMUL': '×', 'DIV': '÷', 'IDIV': '÷',
                    'AND': '&', 'OR': '|', 'ORR': '|', 'XOR': '^', 'EOR': '^',
                    'SHL': '<<', 'SHR': '>>', 'LSL': '<<', 'LSR': '>>',
                    'NEG': 'neg', 'NOT': '~', 'INC': '++', 'DEC': '−−',
                    'CMP': 'cmp', 'CMN': 'cmn', 'TST': 'tst' };
                aluOpEl.textContent = opMap[op] || op;
                aluOpEl.setAttribute('fill', this.componentColors.alu);
            }
            this.activateBus('bus-alu');
        }

        // Memory activation
        if (isMemOp) {
            this.activateComponent('mem-box', this.componentColors.mem);
            this.activateBus('bus-mem');
        }

        // Register file activation
        if (modifiedRegs.size > 0 || isAluOp || op === 'MOV' || op === 'PUSH' || op === 'POP') {
            this.activateComponent('rf-box', this.componentColors.reg);
            this.activateBus('bus-reg');
            this.activateBus('bus-reg-h');

            // Highlight specific modified registers
            for (let i = 0; i < regs.length; i++) {
                if (modifiedRegs.has(regs[i].name)) {
                    const nameEl = this.svg.querySelector(`#rf-name-${i}`);
                    const valEl = this.svg.querySelector(`#rf-val-${i}`);
                    if (nameEl) nameEl.setAttribute('fill', this.componentColors.reg);
                    if (valEl) valEl.setAttribute('fill', this.componentColors.reg);
                }
            }
        }

        // PC read -> bus activation
        if (op !== 'NOP' && op !== 'HLT') {
            this.activateBus('bus-pc');
            this.activateBus('bus-pc-h');
        }

        // Data bus for data movement
        if (op === 'MOV' || isAluOp) {
            this.activateBus('bus-data');
        }

        // Control buses
        this.activateBus('bus-ctrl-alu');
        if (isMemOp) {
            this.activateBus('bus-ctrl-left');
        }
        if (modifiedRegs.size > 0) {
            this.activateBus('bus-ctrl-right');
        }

        // Update memory cells
        if (isMemOp && modifiedMem.size > 0) {
            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 6; col++) {
                    const cell = this.svg.querySelector(`#mem-cell-${row}-${col}`);
                    if (cell) {
                        cell.setAttribute('fill', 'rgba(148,226,213,0.3)');
                    }
                }
            }
        }

        // Halt animation
        if (op === 'HLT' || (stepResult && stepResult.halted)) {
            this.activateComponent('cu-box', this.componentColors.pc);
            if (cuState) {
                cuState.textContent = 'HALTED';
                cuState.setAttribute('fill', this.componentColors.pc);
            }
        }
    }

    reset() {
        if (!this.svg) return;
        this.deactivateAll();
        const pcVal = this.svg.querySelector('#pc-val');
        if (pcVal) pcVal.textContent = '0x' + this.arch.codeBase.toString(16).toUpperCase().padStart(this.arch.bits / 4, '0');
        const irVal = this.svg.querySelector('#ir-val');
        if (irVal) irVal.textContent = 'NOP';
        const regs = this.arch.registers.slice(0, 5);
        for (let i = 0; i < regs.length; i++) {
            const valEl = this.svg.querySelector(`#rf-val-${i}`);
            if (valEl) {
                const hexW = regs[i].size * 2;
                if (regs[i].role === 'sp') {
                    valEl.textContent = '0x' + this.arch.stackBase.toString(16).toUpperCase().padStart(hexW, '0');
                } else {
                    valEl.textContent = '0x' + (0).toString(16).toUpperCase().padStart(hexW, '0');
                }
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUDiagram };
}
