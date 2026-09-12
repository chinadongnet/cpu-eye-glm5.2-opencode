/* ============================================
   cpu.js
   CPU Simulator Core
   Executes IR instructions, manages registers,
   memory, stack, and pipeline state
   ============================================ */

class CPUSimulator {
    constructor(arch) {
        this.arch = arch;
        this.reset();
    }

    reset() {
        this.registers = {};
        for (const reg of this.arch.registers) {
            this.registers[reg.name] = 0;
        }
        this.registers[this.arch.stackRegister] = this.arch.stackBase;
        this.registers[this.arch.bpRegister] = this.arch.stackBase;
        this.registers[this.arch.pcRegister] = this.arch.codeBase;

        this.memory = new Map();
        this.instructions = [];
        this.labelMap = new Map();
        this.addressMap = new Map();
        this.pc = 0;
        this.instructionIndex = 0;
        this.cycles = 0;
        this.executedCount = 0;
        this.halted = false;
        this.returnValue = 0;
        this.callStack = [];
        this.output = [];
        this.flags = { Z: 0, N: 0, C: 0, V: 0, O: 0 };

        this.pipeline = {
            fetch: null,
            decode: null,
            execute: null,
            memory: null,
            writeback: null,
        };
        this.lastModifiedRegs = new Set();
        this.lastModifiedMem = new Set();
        this.isArm = this.arch.name === 'arm32' || this.arch.name === 'arm64';
    }

    load(instructions) {
        this.instructions = instructions;
        this.labelMap.clear();
        this.addressMap.clear();
        for (let i = 0; i < instructions.length; i++) {
            const instr = instructions[i];
            this.addressMap.set(instr.address, i);
            if (instr.label) {
                this.labelMap.set(instr.label, i);
            }
        }
        this.pc = instructions.length > 0 ? instructions[0].address : this.arch.codeBase;
        this.instructionIndex = 0;
    }

    getReg(name) {
        return this.registers[name] || 0;
    }

    setReg(name, value) {
        const regDef = this.arch.registers.find(r => r.name === name);
        if (regDef) {
            let v = Number(value);
            if (regDef.size === 8) {
                v = v % 0x10000000000000000;
                if (v < 0) v += 0x10000000000000000;
            } else if (regDef.size === 4) {
                v = v >>> 0;
            } else if (regDef.size === 2) {
                v = v & 0xFFFF;
            } else if (regDef.size === 1) {
                v = v & 0xFF;
            }
            this.registers[name] = v;
        }
        this.lastModifiedRegs.add(name);
    }

    getMemAddr(base, offset) {
        const baseVal = Number(this.getReg(base));
        const addr = baseVal + (offset || 0);
        return addr;
    }

    readMem(addr, size) {
        let val = 0;
        for (let i = 0; i < size; i++) {
            const byteVal = this.memory.get(addr + i) || 0;
            if (i < 4) {
                val |= byteVal << (i * 8);
            } else {
                val += byteVal * Math.pow(256, i);
            }
        }
        return val;
    }

    writeMem(addr, value, size) {
        for (let i = 0; i < size; i++) {
            const byteVal = Math.floor(value / Math.pow(256, i)) % 256;
            this.memory.set(addr + i, byteVal);
        }
        for (let i = 0; i < size; i++) {
            this.lastModifiedMem.add(addr + i);
        }
    }

    pushStack(value) {
        const sp = this.arch.stackRegister;
        const spVal = this.getReg(sp) - this.arch.ptrSize;
        this.setReg(sp, spVal);
        this.writeMem(spVal, value, this.arch.ptrSize);
    }

    popStack() {
        const sp = this.arch.stackRegister;
        const spVal = this.getReg(sp);
        const val = this.readMem(spVal, this.arch.ptrSize);
        this.setReg(sp, spVal + this.arch.ptrSize);
        return val;
    }

    getOperandValue(operand) {
        if (!operand) return 0;
        switch (operand.type) {
            case 'reg': return Number(this.getReg(operand.value));
            case 'imm': return operand.value;
            case 'mem':
                const addr = this.getMemAddr(operand.base, operand.offset);
                return this.readMem(addr, operand.size || this.arch.ptrSize);
            case 'label':
                if (this.labelMap.has(operand.value)) {
                    return this.instructions[this.labelMap.get(operand.value)].address;
                }
                return 0;
            default: return 0;
        }
    }

    setOperandValue(operand, value) {
        if (!operand) return;
        switch (operand.type) {
            case 'reg': this.setReg(operand.value, value); break;
            case 'mem':
                const addr = this.getMemAddr(operand.base, operand.offset);
                this.writeMem(addr, value, operand.size || this.arch.ptrSize);
                break;
        }
    }

    resolveLabel(label) {
        return this.labelMap.get(label) || -1;
    }

    // ============================================
    // Pipeline simulation
    // ============================================
    simulatePipeline(instr) {
        this.pipeline.fetch = instr ? `${instr.opcode}` : null;
        this.pipeline.decode = instr ? this.decodeInstr(instr) : null;
        this.pipeline.execute = instr ? this.describeExecute(instr) : null;
        this.pipeline.memory = instr ? this.describeMemory(instr) : null;
        this.pipeline.writeback = instr ? this.describeWriteback(instr) : null;
    }

    decodeInstr(instr) {
        const ops = instr.operands.map(o => {
            if (o.type === 'reg') return o.value;
            if (o.type === 'imm') return `#${o.value}`;
            if (o.type === 'mem') return `[${o.base}${o.offset ? (o.offset > 0 ? '+' : '') + o.offset : ''}]`;
            if (o.type === 'label') return o.value;
            return '?';
        });
        return ops.join(', ');
    }

    describeExecute(instr) {
        if (instr.opcode === 'MOV' || instr.opcode === 'LDR' || instr.opcode === 'STR') return 'data transfer';
        if (instr.opcode === 'ADD' || instr.opcode === 'SUB' || instr.opcode === 'MUL' || instr.opcode === 'IMUL') return 'arithmetic';
        if (instr.opcode === 'CMP') return 'compare -> set flags';
        if (instr.opcode === 'JMP' || instr.opcode === 'B' || instr.opcode === 'JE' || instr.opcode === 'JNE' || instr.opcode === 'BEQ' || instr.opcode === 'B_NE') return 'branch eval';
        if (instr.opcode === 'CALL' || instr.opcode === 'BL') return 'call function';
        if (instr.opcode === 'RET' || instr.opcode === 'BX' || instr.opcode === 'BR') return 'return';
        if (instr.opcode === 'PUSH') return 'sp -= ' + this.arch.ptrSize;
        if (instr.opcode === 'POP') return 'sp += ' + this.arch.ptrSize;
        if (instr.opcode === 'LEAVE') return 'restore frame';
        if (instr.opcode === 'HLT') return 'halt';
        if (instr.opcode === 'NOP') return 'nop';
        return instr.opcode.toLowerCase();
    }

    describeMemory(instr) {
        if (instr.opcode === 'MOV' && instr.operands[0]?.type === 'mem') return `write [mem]`;
        if (instr.opcode === 'MOV' && instr.operands[1]?.type === 'mem') return `read [mem]`;
        if (instr.opcode === 'STR') return `write [mem]`;
        if (instr.opcode === 'LDR') return `read [mem]`;
        if (instr.opcode === 'PUSH') return `write [sp-${this.arch.ptrSize}]`;
        if (instr.opcode === 'POP') return `read [sp]`;
        if (instr.opcode === 'CALL' || instr.opcode === 'BL') return `write [sp] (return addr)`;
        if (instr.opcode === 'LEAVE') return `restore stack`;
        return '-';
    }

    describeWriteback(instr) {
        if (instr.opcode === 'MOV' && instr.operands[0]?.type === 'reg') return `${instr.operands[0].value} = ${this.getOperandValue(instr.operands[1])}`;
        if (instr.opcode === 'ADD' && instr.operands[0]?.type === 'reg') return `${instr.operands[0].value} = result`;
        if (instr.opcode === 'SUB' && instr.operands[0]?.type === 'reg') return `${instr.operands[0].value} = result`;
        if (instr.opcode === 'POP' && instr.operands[0]?.type === 'reg') return `${instr.operands[0].value} = [sp]`;
        if (instr.opcode === 'LEA' && instr.operands[0]?.type === 'reg') return `${instr.operands[0].value} = addr`;
        if (instr.opcode === 'CALL' || instr.opcode === 'BL') return `PC = ${instr.operands[0]?.value}`;
        if (instr.opcode === 'RET' || instr.opcode === 'BX') return `PC = [sp]`;
        if (instr.opcode === 'LEAVE') return `SP=BP, BP=[SP]`;
        return '-';
    }

    // ============================================
    // Instruction Execution
    // ============================================
    step() {
        if (this.halted) return { halted: true };
        if (this.instructionIndex >= this.instructions.length) {
            this.halted = true;
            return { halted: true };
        }

        this.lastModifiedRegs.clear();
        this.lastModifiedMem.clear();
        this.cycles++;

        const instr = this.instructions[this.instructionIndex];
        this.simulatePipeline(instr);

        const result = this.executeInstruction(instr);

        if (!result || !result.jumped) {
            if (this.lastModifiedRegs.has(this.arch.pcRegister)) {
                const newPc = this.getReg(this.arch.pcRegister);
                const idx = this.addressMap.get(newPc);
                if (idx !== undefined) {
                    this.instructionIndex = idx;
                    this.pc = this.instructions[idx].address;
                } else {
                    this.halted = true;
                }
            } else {
                this.instructionIndex++;
                if (this.instructionIndex < this.instructions.length) {
                    this.pc = this.instructions[this.instructionIndex].address;
                } else {
                    this.halted = true;
                }
            }
        } else if (result.jumpTarget !== undefined) {
            this.instructionIndex = result.jumpTarget;
            if (this.instructionIndex >= 0 && this.instructionIndex < this.instructions.length) {
                this.pc = this.instructions[this.instructionIndex].address;
            } else {
                this.halted = true;
            }
        }

        if (!this.halted) {
            this.setReg(this.arch.pcRegister, this.pc);
        }
        this.executedCount++;

        return {
            instr,
            modifiedRegs: [...this.lastModifiedRegs],
            modifiedMem: [...this.lastModifiedMem],
            pipeline: { ...this.pipeline },
            halted: this.halted,
            cycles: this.cycles,
        };
    }

    executeInstruction(instr) {
        const op = instr.opcode;
        const ops = instr.operands;

        switch (op) {
            case 'NOP': return {};
            case 'HLT':
                this.halted = true;
                this.output.push({ type: 'info', text: `Program halted. Exit code: ${this.returnValue}` });
                return { halted: true };

            case 'MOV': case 'MOVZ':
                if (ops.length >= 2) {
                    const val = this.getOperandValue(ops[1]);
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'ADD':
                if (ops.length === 3) {
                    const val = (this.getOperandValue(ops[1]) + this.getOperandValue(ops[2])) >>> 0;
                    this.setOperandValue(ops[0], val);
                    this.flags.N = (val & 0x80000000) ? 1 : 0;
                    this.flags.Z = val === 0 ? 1 : 0;
                } else if (ops.length === 2) {
                    const val = (this.getOperandValue(ops[0]) + this.getOperandValue(ops[1])) >>> 0;
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'SUB':
                if (ops.length === 3) {
                    const a = this.getOperandValue(ops[1]);
                    const b = this.getOperandValue(ops[2]);
                    const val = (a - b) >>> 0;
                    this.setOperandValue(ops[0], val);
                    this.flags.Z = val === 0 ? 1 : 0;
                    this.flags.N = (val & 0x80000000) ? 1 : 0;
                    this.flags.C = a >= b ? 1 : 0;
                } else if (ops.length === 2) {
                    const val = (this.getOperandValue(ops[0]) - this.getOperandValue(ops[1])) >>> 0;
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'MUL': case 'IMUL':
                if (ops.length === 3) {
                    const val = (this.getOperandValue(ops[1]) * this.getOperandValue(ops[2])) >>> 0;
                    this.setOperandValue(ops[0], val);
                } else if (ops.length === 2) {
                    const val = (this.getOperandValue(ops[0]) * this.getOperandValue(ops[1])) >>> 0;
                    this.setOperandValue(ops[0], val);
                } else if (ops.length === 1) {
                    const val = (this.getReg(this.arch.returnRegister) * this.getOperandValue(ops[0])) >>> 0;
                    this.setReg(this.arch.returnRegister, val);
                }
                return {};

            case 'DIV': case 'IDIV': case 'SDIV': case 'UDIV':
                if (ops.length === 3) {
                    const b = this.getOperandValue(ops[2]);
                    const val = b !== 0 ? (this.getOperandValue(ops[1]) / b) >>> 0 : 0;
                    this.setOperandValue(ops[0], Math.floor(val));
                } else if (ops.length === 1) {
                    const b = this.getOperandValue(ops[0]);
                    if (b !== 0) {
                        const quotient = Math.floor(this.getReg('EAX') / b);
                        const remainder = this.getReg('EAX') % b;
                        this.setReg('EAX', quotient);
                        this.setReg('EDX', remainder);
                    }
                }
                return {};

            case 'AND':
                if (ops.length === 3) {
                    const val = this.getOperandValue(ops[1]) & this.getOperandValue(ops[2]);
                    this.setOperandValue(ops[0], val);
                } else if (ops.length === 2) {
                    const val = this.getOperandValue(ops[0]) & this.getOperandValue(ops[1]);
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'OR': case 'ORR':
                if (ops.length === 3) {
                    const val = this.getOperandValue(ops[1]) | this.getOperandValue(ops[2]);
                    this.setOperandValue(ops[0], val);
                } else if (ops.length === 2) {
                    const val = this.getOperandValue(ops[0]) | this.getOperandValue(ops[1]);
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'XOR': case 'EOR':
                if (ops.length === 3) {
                    const val = this.getOperandValue(ops[1]) ^ this.getOperandValue(ops[2]);
                    this.setOperandValue(ops[0], val);
                } else if (ops.length === 2) {
                    const val = this.getOperandValue(ops[0]) ^ this.getOperandValue(ops[1]);
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'NOT':
                if (ops.length >= 1) {
                    const val = ~this.getOperandValue(ops[0]);
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'NEG':
                if (ops.length >= 1) {
                    const val = (-this.getOperandValue(ops[0])) >>> 0;
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'INC':
                if (ops.length >= 1) {
                    const val = (this.getOperandValue(ops[0]) + 1) >>> 0;
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'DEC':
                if (ops.length >= 1) {
                    const val = (this.getOperandValue(ops[0]) - 1) >>> 0;
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'SHL': case 'LSL':
                if (ops.length === 3) {
                    const val = this.getOperandValue(ops[1]) << this.getOperandValue(ops[2]);
                    this.setOperandValue(ops[0], val >>> 0);
                } else if (ops.length === 2) {
                    const val = this.getOperandValue(ops[0]) << this.getOperandValue(ops[1]);
                    this.setOperandValue(ops[0], val >>> 0);
                }
                return {};

            case 'SHR': case 'LSR':
                if (ops.length === 3) {
                    const val = this.getOperandValue(ops[1]) >>> this.getOperandValue(ops[2]);
                    this.setOperandValue(ops[0], val);
                } else if (ops.length === 2) {
                    const val = this.getOperandValue(ops[0]) >>> this.getOperandValue(ops[1]);
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'CMP': case 'CMN': case 'TST':
                if (ops.length >= 2) {
                    const a = this.getOperandValue(ops[0]);
                    const b = this.getOperandValue(ops[1]);
                    const diff = (a - b) | 0;
                    this.flags.Z = diff === 0 ? 1 : 0;
                    this.flags.N = diff < 0 ? 1 : 0;
                    this.flags.C = a >= b ? 1 : 0;
                }
                return {};

            case 'PUSH':
                if (ops.length >= 1) {
                    if (ops[0].type === 'reg' && ops.length > 1) {
                        for (let i = ops.length - 1; i >= 0; i--) {
                            this.pushStack(this.getOperandValue(ops[i]));
                        }
                    } else {
                        this.pushStack(this.getOperandValue(ops[0]));
                    }
                }
                return {};

            case 'POP':
                if (ops.length >= 1) {
                    if (ops[0].type === 'reg' && ops.length > 1) {
                        for (let i = 0; i < ops.length; i++) {
                            this.setOperandValue(ops[i], this.popStack());
                        }
                    } else {
                        this.setOperandValue(ops[0], this.popStack());
                    }
                }
                return {};

            case 'STP':
                if (ops.length === 3) {
                    const sp = this.getReg(this.arch.stackRegister) - 16;
                    this.setReg(this.arch.stackRegister, sp);
                    this.writeMem(sp, this.getOperandValue(ops[0]), this.arch.ptrSize);
                    this.writeMem(sp + this.arch.ptrSize, this.getOperandValue(ops[1]), this.arch.ptrSize);
                }
                return {};

            case 'LDP':
                if (ops.length === 3) {
                    const sp = this.getOperandValue(ops[2]);
                    this.setOperandValue(ops[0], this.readMem(sp, this.arch.ptrSize));
                    this.setOperandValue(ops[1], this.readMem(sp + this.arch.ptrSize, this.arch.ptrSize));
                    this.setReg(this.arch.stackRegister, sp + 16);
                }
                return {};

            case 'LEA':
                if (ops.length >= 2 && ops[1].type === 'label') {
                    const target = this.resolveLabel(ops[1].value);
                    if (target >= 0) {
                        this.setOperandValue(ops[0], this.instructions[target].address);
                    }
                } else if (ops.length >= 2 && ops[1].type === 'mem') {
                    const addr = this.getMemAddr(ops[1].base, ops[1].offset);
                    this.setOperandValue(ops[0], addr);
                }
                return {};

            case 'LDR':
                if (ops.length >= 2 && ops[1].type === 'label') {
                    const target = this.resolveLabel(ops[1].value);
                    if (target >= 0) {
                        this.setOperandValue(ops[0], this.instructions[target].address);
                    }
                } else if (ops.length >= 2 && ops[1].type === 'mem') {
                    const addr = this.getMemAddr(ops[1].base, ops[1].offset);
                    this.setOperandValue(ops[0], this.readMem(addr, ops[1].size || this.arch.ptrSize));
                }
                return {};

            case 'STR':
                if (ops.length >= 2 && ops[1].type === 'mem') {
                    const addr = this.getMemAddr(ops[1].base, ops[1].offset);
                    this.writeMem(addr, this.getOperandValue(ops[0]), ops[1].size || this.arch.ptrSize);
                }
                return {};

            case 'JMP': case 'B':
                if (ops.length >= 1) {
                    if (ops[0].type === 'label') {
                        const target = this.resolveLabel(ops[0].value);
                        if (target >= 0) return { jumped: true, jumpTarget: target };
                    } else if (ops[0].type === 'reg') {
                        const addr = this.getOperandValue(ops[0]);
                        const idx = this.addressMap.get(addr);
                        if (idx !== undefined) return { jumped: true, jumpTarget: idx };
                    }
                }
                return {};

            case 'JE': case 'BEQ': case 'B_EQ':
                if (this.flags.Z === 1) {
                    return this.doBranch(ops[0]);
                }
                return {};

            case 'JNE': case 'BNE': case 'B_NE':
                if (this.flags.Z === 0) {
                    return this.doBranch(ops[0]);
                }
                return {};

            case 'JL': case 'JGE': case 'JG': case 'JLE':
            case 'BLT': case 'BGE': case 'BGT': case 'BLE':
            case 'B_LT': case 'B_GE': case 'B_GT': case 'B_LE': {
                let taken = false;
                const opUpper = op.toUpperCase();
                if (opUpper === 'JL' || opUpper === 'BLT' || opUpper === 'B_LT') taken = this.flags.N !== this.flags.V || this.flags.Z === 0;
                if (opUpper === 'JGE' || opUpper === 'BGE' || opUpper === 'B_GE') taken = this.flags.N === this.flags.V;
                if (opUpper === 'JG' || opUpper === 'BGT' || opUpper === 'B_GT') taken = this.flags.Z === 0 && this.flags.N === this.flags.V;
                if (opUpper === 'JLE' || opUpper === 'BLE' || opUpper === 'B_LE') taken = this.flags.Z === 1 || this.flags.N !== this.flags.V;
                if (taken) return this.doBranch(ops[0]);
                return {};
            }

            case 'CALL': case 'BL': {
                let target = -1;
                if (ops[0].type === 'label') {
                    target = this.resolveLabel(ops[0].value);
                }
                if (target >= 0) {
                    const nextIdx = this.instructionIndex + 1;
                    const retAddr = nextIdx < this.instructions.length
                        ? this.instructions[nextIdx].address
                        : this.instructions[this.instructionIndex].address + (this.arch.bits === 32 ? 4 : 8);
                    if (this.arch.linkRegister) {
                        this.setReg(this.arch.linkRegister, retAddr);
                    } else {
                        this.pushStack(retAddr);
                    }
                    this.callStack.push({ func: ops[0].value, returnIdx: nextIdx });
                    return { jumped: true, jumpTarget: target };
                }
                return {};
            }

            case 'RET': case 'BX': case 'BR': {
                let retAddr;
                if (this.arch.linkRegister && (op === 'RET' || op === 'BR')) {
                    retAddr = this.getReg(this.arch.linkRegister);
                } else {
                    retAddr = this.popStack();
                }
                const idx = this.addressMap.get(retAddr);
                if (idx !== undefined) {
                    if (this.callStack.length > 0) this.callStack.pop();
                    return { jumped: true, jumpTarget: idx };
                }
                this.halted = true;
                return { halted: true };
            }

            case 'LEAVE': {
                const bp = this.arch.bpRegister;
                const sp = this.arch.stackRegister;
                this.setReg(sp, this.getReg(bp));
                this.setReg(bp, this.popStack());
                return {};
            }

            case 'INT': case 'SVC': {
                const num = this.getOperandValue(ops[0]);
                this.output.push({ type: 'info', text: `System call #${num}` });
                if (num === 0x80 || num === 1) {
                    this.halted = true;
                    this.returnValue = this.getReg(this.arch.returnRegister);
                    this.output.push({ type: 'success', text: `Program exited with code: ${this.returnValue}` });
                }
                return { halted: this.halted };
            }

            case 'TEST':
                if (ops.length >= 2) {
                    const val = this.getOperandValue(ops[0]) & this.getOperandValue(ops[1]);
                    this.flags.Z = val === 0 ? 1 : 0;
                }
                return {};

            case 'MOVK': case 'MVN':
                if (ops.length >= 2) {
                    this.setOperandValue(ops[0], ~this.getOperandValue(ops[1]));
                }
                return {};

            case 'MLA': case 'MADD':
                if (ops.length === 4) {
                    const val = (this.getOperandValue(ops[1]) * this.getOperandValue(ops[2]) + this.getOperandValue(ops[3])) >>> 0;
                    this.setOperandValue(ops[0], val);
                }
                return {};

            case 'LDM': case 'STM':
                return {};

            default:
                return {};
        }
    }

    doBranch(operand) {
        if (operand.type === 'label') {
            const target = this.resolveLabel(operand.value);
            if (target >= 0) return { jumped: true, jumpTarget: target };
        } else if (operand.type === 'reg') {
            const addr = this.getOperandValue(operand);
            const idx = this.addressMap.get(addr);
            if (idx !== undefined) return { jumped: true, jumpTarget: idx };
        }
        return {};
    }

    // ============================================
    // Memory dump for visualization
    // ============================================
    dumpMemRegion(start, end, label) {
        const rows = [];
        const baseAddr = Math.floor(start / 16) * 16;
        const endAddr = Math.ceil(end / 16) * 16;
        for (let addr = baseAddr; addr < endAddr; addr += 16) {
            if (addr < start || addr >= end) continue;
            const bytes = [];
            const ascii = [];
            for (let i = 0; i < 16; i++) {
                const b = this.memory.get(addr + i);
                if (b !== undefined) {
                    bytes.push({ value: b, addr: addr + i });
                    ascii.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
                } else {
                    bytes.push({ value: null, addr: addr + i });
                    ascii.push(' ');
                }
            }
            rows.push({ addr, bytes, ascii: ascii.join(''), label });
        }
        return rows;
    }

    dumpStack() {
        const sp = this.getReg(this.arch.stackRegister);
        const bp = this.getReg(this.arch.bpRegister);
        const top = Math.max(sp, bp) - 32;
        const bottom = Math.min(sp, this.arch.stackBase) + 64;
        return this.dumpMemRegion(Math.min(top, bottom), Math.max(top, bottom), 'STACK');
    }

    dumpHeap() {
        return this.dumpMemRegion(this.arch.heapBase, this.arch.heapBase + 256, 'HEAP');
    }

    dumpData() {
        return this.dumpMemRegion(this.arch.dataBase, this.arch.dataBase + 256, 'DATA');
    }

    getState() {
        return {
            registers: { ...this.registers },
            flags: { ...this.flags },
            pc: this.pc,
            instructionIndex: this.instructionIndex,
            cycles: this.cycles,
            executedCount: this.executedCount,
            halted: this.halted,
            pipeline: { ...this.pipeline },
            callStack: [...this.callStack],
            output: [...this.output],
            returnValue: this.returnValue,
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUSimulator };
}
