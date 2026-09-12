/* ============================================
   codegen.js
   Code Generator: AST -> Architecture-specific Assembly IR
   Supports x86, x86_64, arm32, arm64
   ============================================ */

class StructInfo {
    constructor(name) {
        this.name = name;
        this.fields = new Map();
        this.size = 0;
        this.alignment = 4;
    }

    addField(name, type, offset) {
        this.fields.set(name, { name, type, offset });
    }

    getFieldOffset(name) {
        const f = this.fields.get(name);
        return f ? f.offset : 0;
    }

    getField(name) {
        return this.fields.get(name);
    }
}

class CodeGenerator {
    constructor(arch) {
        this.arch = arch;
        this.instructions = [];
        this.addressCounter = arch.codeBase;
        this.instructionId = 0;
        this.labelCounter = 0;
        this.structs = new Map();
        this.localVars = new Map();
        this.stackOffset = 0;
        this.maxStackOffset = 0;
        this.stringPool = new Map();
        this.stringAddr = arch.dataBase;
        this.currentFuncName = '';
        this.isArm = arch.name === 'arm32' || arch.name === 'arm64';
        this.isX86 = arch.name === 'x86' || arch.name === 'x86_64';
        this.pendingLabel = null;
    }

    getTypeSize(type) {
        type = type.replace(/\*/g, '').replace(/&/g, '').trim();
        if (type === 'int' || type === 'float' || type === 'unsigned int') return 4;
        if (type === 'double' || type === 'long' || type === 'long long' || type === 'unsigned long') return 8;
        if (type === 'char' || type === 'bool' || type === 'unsigned char') return 1;
        if (type === 'short' || type === 'unsigned short') return 2;
        if (this.structs.has(type)) return this.structs.get(type).size;
        return 4;
    }

    isPointerType(type) {
        return type.includes('*');
    }

    buildStructs(ast) {
        for (const decl of ast.declarations) {
            if (decl.type === ASTType.CLASS_DECL) {
                this.buildStruct(decl);
            }
        }
    }

    buildStruct(classDecl) {
        const info = new StructInfo(classDecl.name);
        let offset = 0;
        for (const field of classDecl.members.fields) {
            const size = this.getTypeSize(field.type);
            const alignedOffset = this.align(offset, Math.min(size, this.arch.ptrSize));
            info.addField(field.name, field.type, alignedOffset);
            offset = alignedOffset + size;
        }
        info.size = this.align(offset, this.arch.ptrSize);
        this.structs.set(classDecl.name, info);
    }

    align(value, alignment) {
        return Math.ceil(value / alignment) * alignment;
    }

    emit(opcode, operands, comment, sourceLine) {
        const instr = {
            id: this.instructionId++,
            address: this.addressCounter,
            opcode,
            operands: operands || [],
            comment: comment || '',
            sourceLine: sourceLine || 0,
            label: this.pendingLabel || null,
        };
        this.pendingLabel = null;
        this.instructions.push(instr);
        this.addressCounter += this.arch.bits === 32 ? 4 : 8;
        return instr;
    }

    emitLabel(label) {
        this.pendingLabel = label;
        return label;
    }

    newLabel(prefix) {
        return `${prefix || 'L'}_${this.labelCounter++}`;
    }

    getStackPtr() {
        return this.arch.stackRegister;
    }
    getBasePtr() {
        return this.arch.bpRegister;
    }
    getPC() {
        return this.arch.pcRegister;
    }

    getTempReg(idx) {
        if (this.isArm) {
            if (this.arch.bits === 64) return `X${idx}`;
            return `R${idx}`;
        }
        if (this.arch.bits === 64) {
            const regs = ['RAX', 'RCX', 'RDX', 'R8', 'R9', 'R10'];
            return regs[idx];
        }
        const regs = ['EAX', 'ECX', 'EDX'];
        return regs[idx];
    }

    getReturnReg() {
        return this.arch.returnRegister;
    }

    // ============================================
    // Generate Program
    // ============================================
    generate(ast) {
        this.buildStructs(ast);
        this.emit('NOP', [], 'CPU Eye - Generated Code', 0);
        this.emitLabel('_start');

        let mainFunc = null;
        for (const decl of ast.declarations) {
            if (decl.type === ASTType.FUNC_DECL && decl.name === 'main') {
                mainFunc = decl;
            }
        }

        if (mainFunc) {
            this.emit('CALL', [{ type: 'label', value: 'main' }], 'call main()', 0);
            const exitReg = this.getReturnReg();
            this.emit('MOV', [{ type: 'reg', value: this.getTempReg(0) }, { type: 'reg', value: exitReg }], 'exit code', 0);
            this.emit('INT', [{ type: 'imm', value: 0x80 }], 'exit syscall', 0);
            this.emit('HLT', [], 'program end', 0);
        }

        for (const decl of ast.declarations) {
            if (decl.type === ASTType.FUNC_DECL) {
                this.generateFunction(decl);
            }
        }

        this.emit('HLT', [], 'end of program', 0);
        return this.instructions;
    }

    // ============================================
    // Function Generation
    // ============================================
    generateFunction(funcDecl) {
        this.currentFuncName = funcDecl.name;
        this.localVars.clear();
        this.stackOffset = 0;
        this.maxStackOffset = 0;

        this.emitLabel(funcDecl.name);
        this.emit('NOP', [], `function: ${funcDecl.name}()`, funcDecl.line);

        // Prologue
        if (this.isX86) {
            this.emit('PUSH', [{ type: 'reg', value: this.getBasePtr() }], 'save base pointer', funcDecl.line);
            this.emit('MOV', [{ type: 'reg', value: this.getBasePtr() }, { type: 'reg', value: this.getStackPtr() }], 'setup frame pointer', funcDecl.line);
        } else {
            if (this.arch.bits === 64) {
                this.emit('STP', [{ type: 'reg', value: this.getBasePtr() }, { type: 'reg', value: 'LR' }, { type: 'mem', base: this.getStackPtr(), offset: -16 }], 'save FP, LR', funcDecl.line);
                this.emit('MOV', [{ type: 'reg', value: this.getBasePtr() }, { type: 'reg', value: this.getStackPtr() }], 'setup frame pointer', funcDecl.line);
            } else {
                this.emit('PUSH', [{ type: 'reg', value: this.getBasePtr() }, { type: 'reg', value: 'LR' }], 'save FP, LR', funcDecl.line);
                this.emit('MOV', [{ type: 'reg', value: this.getBasePtr() }, { type: 'reg', value: this.getStackPtr() }], 'setup frame pointer', funcDecl.line);
            }
        }

        // Allocate space for parameters (in registers -> stored to stack)
        if (funcDecl.params && funcDecl.params.length > 0) {
            const argRegs = this.arch.callingConv.argRegisters;
            for (let i = 0; i < funcDecl.params.length; i++) {
                const param = funcDecl.params[i];
                const size = this.getTypeSize(param.paramType);
                this.stackOffset += this.align(size, this.arch.ptrSize);
                const offset = -this.stackOffset;
                this.localVars.set(param.paramName, { offset, size, type: param.paramType });
                if (i < argRegs.length) {
                    this.emit('MOV', [
                        { type: 'mem', base: this.getBasePtr(), offset, size },
                        { type: 'reg', value: argRegs[i] }
                    ], `param ${param.paramName}`, param.line);
                }
            }
        }

        // First pass: calculate local variable space
        if (funcDecl.body) {
            this.collectLocals(funcDecl.body);
        }

        // Allocate stack space
        const totalStack = this.align(this.maxStackOffset, this.arch.stackAlignment);
        if (totalStack > 0) {
            if (this.isX86) {
                this.emit('SUB', [{ type: 'reg', value: this.getStackPtr() }, { type: 'imm', value: totalStack }], `allocate ${totalStack} bytes locals`, funcDecl.line);
            } else {
                if (this.arch.bits === 64) {
                    this.emit('SUB', [{ type: 'reg', value: this.getStackPtr() }, { type: 'imm', value: this.align(totalStack + 16, 16) }], `allocate stack`, funcDecl.line);
                } else {
                    this.emit('SUB', [{ type: 'reg', value: this.getStackPtr() }, { type: 'imm', value: this.align(totalStack, 8) }], `allocate stack`, funcDecl.line);
                }
            }
        }

        // Generate body
        if (funcDecl.body) {
            this.generateBlock(funcDecl.body);
        }

        // Epilogue (default return)
        this.emitLabel(`${funcDecl.name}_epilogue`);
        this.emit('MOV', [{ type: 'reg', value: this.getReturnReg() }, { type: 'imm', value: 0 }], 'default return 0', funcDecl.line);

        if (this.isX86) {
            this.emit('LEAVE', [], 'restore stack frame', funcDecl.line);
            this.emit('RET', [], `return from ${funcDecl.name}`, funcDecl.line);
        } else {
            if (this.arch.bits === 64) {
                this.emit('LDP', [{ type: 'reg', value: this.getBasePtr() }, { type: 'reg', value: 'LR' }, { type: 'mem', base: this.getStackPtr(), offset: 0 }], 'restore FP, LR', funcDecl.line);
                this.emit('ADD', [{ type: 'reg', value: this.getStackPtr() }, { type: 'reg', value: this.getStackPtr() }, { type: 'imm', value: this.align(totalStack + 16, 16) }], 'deallocate stack', funcDecl.line);
                this.emit('RET', [], `return from ${funcDecl.name}`, funcDecl.line);
            } else {
                this.emit('ADD', [{ type: 'reg', value: this.getStackPtr() }, { type: 'reg', value: this.getStackPtr() }, { type: 'imm', value: this.align(totalStack, 8) }], 'deallocate stack', funcDecl.line);
                this.emit('POP', [{ type: 'reg', value: this.getBasePtr() }, { type: 'reg', value: 'PC' }], 'return', funcDecl.line);
            }
        }
    }

    collectLocals(block) {
        if (!block) return;
        const statements = block.statements || (block.type === ASTType.BLOCK ? block.statements : [block]);
        if (!statements) return;
        for (const stmt of statements) {
            if (!stmt) continue;
            if (stmt.type === ASTType.VAR_DECL) {
                const size = this.getTypeSize(stmt.varType);
                this.stackOffset += this.align(size, this.arch.ptrSize);
                this.localVars.set(stmt.name, { offset: -this.stackOffset, size, type: stmt.varType });
                if (this.stackOffset > this.maxStackOffset) this.maxStackOffset = this.stackOffset;
            }
            if (stmt.type === ASTType.BLOCK) this.collectLocals(stmt);
            if (stmt.type === ASTType.IF_STMT) {
                this.collectLocals(stmt.thenBranch);
                if (stmt.elseBranch) this.collectLocals(stmt.elseBranch);
            }
            if (stmt.type === ASTType.WHILE_STMT) this.collectLocals(stmt.body);
            if (stmt.type === ASTType.FOR_STMT) {
                if (stmt.init && stmt.init.type === ASTType.VAR_DECL) {
                    const size = this.getTypeSize(stmt.init.varType);
                    this.stackOffset += this.align(size, this.arch.ptrSize);
                    this.localVars.set(stmt.init.name, { offset: -this.stackOffset, size, type: stmt.init.varType });
                    if (this.stackOffset > this.maxStackOffset) this.maxStackOffset = this.stackOffset;
                }
                this.collectLocals(stmt.body);
            }
        }
    }

    generateBlock(block) {
        if (!block || !block.statements) return;
        for (const stmt of block.statements) {
            this.generateStatement(stmt);
        }
    }

    // ============================================
    // Statement Generation
    // ============================================
    generateStatement(stmt) {
        if (!stmt) return;
        switch (stmt.type) {
            case ASTType.VAR_DECL:
                this.generateVarDecl(stmt);
                break;
            case ASTType.EXPR_STMT:
                this.generateExpression(stmt.expr);
                break;
            case ASTType.RETURN_STMT:
                this.generateReturn(stmt);
                break;
            case ASTType.IF_STMT:
                this.generateIf(stmt);
                break;
            case ASTType.WHILE_STMT:
                this.generateWhile(stmt);
                break;
            case ASTType.FOR_STMT:
                this.generateFor(stmt);
                break;
            case ASTType.BLOCK:
                this.generateBlock(stmt);
                break;
            case ASTType.BREAK_STMT:
                if (this.breakLabel) {
                    this.emit('JMP', [{ type: 'label', value: this.breakLabel }], 'break', stmt.line);
                }
                break;
            case ASTType.CONTINUE_STMT:
                if (this.continueLabel) {
                    this.emit('JMP', [{ type: 'label', value: this.continueLabel }], 'continue', stmt.line);
                }
                break;
        }
    }

    generateVarDecl(stmt) {
        const info = this.localVars.get(stmt.name);
        if (!info) return;

        const typeSize = info.size;
        const structInfo = this.structs.get(stmt.varType.replace('*', '').trim());

        if (structInfo) {
            // Initialize struct fields to zero or their defaults
            let fieldOffset = 0;
            for (const [fieldName, field] of structInfo.fields) {
                const absOffset = info.offset + field.offset;
                this.emit('MOV', [
                    { type: 'mem', base: this.getBasePtr(), offset: absOffset, size: this.getTypeSize(field.type) },
                    { type: 'imm', value: 0 }
                ], `${stmt.name}.${fieldName} = 0 (init)`, stmt.line);
                fieldOffset = field.offset + this.getTypeSize(field.type);
            }
        }

        if (stmt.initVal) {
            this.generateAssignmentToVar(stmt.name, stmt.initVal, stmt.line);
        }
    }

    generateAssignmentToVar(varName, expr, line) {
        const info = this.localVars.get(varName);
        if (!info) return;

        const resultReg = this.getTempReg(0);
        this.generateExpressionToReg(expr, resultReg);

        this.emit('MOV', [
            { type: 'mem', base: this.getBasePtr(), offset: info.offset, size: info.size },
            { type: 'reg', value: resultReg }
        ], `${varName} = <value>`, line);
    }

    generateReturn(stmt) {
        if (stmt.value) {
            const reg = this.getReturnReg();
            this.generateExpressionToReg(stmt.value, reg);
            this.emit('MOV', [{ type: 'reg', value: this.getReturnReg() }, { type: 'reg', value: reg }], `return ${this.exprToString(stmt.value)}`, stmt.line);
        } else {
            this.emit('MOV', [{ type: 'reg', value: this.getReturnReg() }, { type: 'imm', value: 0 }], 'return', stmt.line);
        }
        this.emit('JMP', [{ type: 'label', value: `${this.currentFuncName}_epilogue` }], 'jump to epilogue', stmt.line);
    }

    generateIf(stmt) {
        const elseLabel = this.newLabel('else');
        const endLabel = this.newLabel('endif');

        this.generateExpressionToReg(stmt.condition, this.getTempReg(0));
        this.emit('CMP', [{ type: 'reg', value: this.getTempReg(0) }, { type: 'imm', value: 0 }], `if (${this.exprToString(stmt.condition)})`, stmt.line);

        if (this.isArm) {
            this.emit('BEQ', [{ type: 'label', value: elseLabel }], 'branch if false', stmt.line);
        } else {
            this.emit('JE', [{ type: 'label', value: elseLabel }], 'jump if false', stmt.line);
        }

        this.generateStatement(stmt.thenBranch);
        this.emit('JMP', [{ type: 'label', value: endLabel }], '', stmt.line);
        this.emitLabel(elseLabel);

        if (stmt.elseBranch) {
            this.generateStatement(stmt.elseBranch);
        }
        this.emitLabel(endLabel);
    }

    generateWhile(stmt) {
        const startLabel = this.newLabel('while');
        const endLabel = this.newLabel('endwhile');
        const savedBreak = this.breakLabel;
        const savedContinue = this.continueLabel;
        this.breakLabel = endLabel;
        this.continueLabel = startLabel;

        this.emitLabel(startLabel);
        this.generateExpressionToReg(stmt.condition, this.getTempReg(0));
        this.emit('CMP', [{ type: 'reg', value: this.getTempReg(0) }, { type: 'imm', value: 0 }], `while (${this.exprToString(stmt.condition)})`, stmt.line);

        if (this.isArm) {
            this.emit('BEQ', [{ type: 'label', value: endLabel }], 'exit loop if false', stmt.line);
        } else {
            this.emit('JE', [{ type: 'label', value: endLabel }], 'exit loop if false', stmt.line);
        }

        this.generateStatement(stmt.body);
        this.emit('JMP', [{ type: 'label', value: startLabel }], 'loop back', stmt.line);
        this.emitLabel(endLabel);

        this.breakLabel = savedBreak;
        this.continueLabel = savedContinue;
    }

    generateFor(stmt) {
        const startLabel = this.newLabel('for');
        const updateLabel = this.newLabel('forupd');
        const endLabel = this.newLabel('endfor');
        const savedBreak = this.breakLabel;
        const savedContinue = this.continueLabel;
        this.breakLabel = endLabel;
        this.continueLabel = updateLabel;

        if (stmt.init) this.generateStatement(stmt.init);
        this.emitLabel(startLabel);

        if (stmt.condition) {
            this.generateExpressionToReg(stmt.condition, this.getTempReg(0));
            this.emit('CMP', [{ type: 'reg', value: this.getTempReg(0) }, { type: 'imm', value: 0 }], `for condition`, stmt.line);
            if (this.isArm) {
                this.emit('BEQ', [{ type: 'label', value: endLabel }], 'exit loop', stmt.line);
            } else {
                this.emit('JE', [{ type: 'label', value: endLabel }], 'exit loop', stmt.line);
            }
        }

        this.generateStatement(stmt.body);
        this.emitLabel(updateLabel);
        if (stmt.update) this.generateExpression(stmt.update);
        this.emit('JMP', [{ type: 'label', value: startLabel }], 'loop back', stmt.line);
        this.emitLabel(endLabel);

        this.breakLabel = savedBreak;
        this.continueLabel = savedContinue;
    }

    // ============================================
    // Expression Generation
    // ============================================
    generateExpression(expr) {
        this.generateExpressionToReg(expr, this.getTempReg(0));
    }

    generateExpressionToReg(expr, reg) {
        if (!expr) {
            this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'imm', value: 0 }], '', 0);
            return;
        }

        switch (expr.type) {
            case ASTType.NUMBER_LITERAL:
                this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'imm', value: expr.value }], `${expr.raw || expr.value}`, expr.line);
                break;

            case ASTType.STRING_LITERAL:
                const strLabel = this.addString(expr.value);
                if (this.isX86) {
                    this.emit('LEA', [{ type: 'reg', value: reg }, { type: 'label', value: strLabel }], `"${expr.value}"`, expr.line);
                } else {
                    this.emit('LDR', [{ type: 'reg', value: reg }, { type: 'label', value: strLabel }], `"${expr.value}"`, expr.line);
                }
                break;

            case ASTType.CHAR_LITERAL:
                this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'imm', value: expr.value }], `'${String.fromCharCode(expr.value)}'`, expr.line);
                break;

            case ASTType.BOOL_LITERAL:
                this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'imm', value: expr.value ? 1 : 0 }], `${expr.value}`, expr.line);
                break;

            case ASTType.IDENTIFIER:
                this.generateIdentifierLoad(expr, reg);
                break;

            case ASTType.MEMBER_ACCESS:
                this.generateMemberAccess(expr, reg);
                break;

            case ASTType.ASSIGN_OP:
                this.generateAssignment(expr, reg);
                break;

            case ASTType.BINARY_OP:
                this.generateBinaryOp(expr, reg);
                break;

            case ASTType.UNARY_OP:
                this.generateUnaryOp(expr, reg);
                break;

            case ASTType.CALL_EXPR:
                this.generateCall(expr, reg);
                break;

            default:
                this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'imm', value: 0 }], `// unknown expr`, expr.line || 0);
        }
    }

    generateIdentifierLoad(expr, reg) {
        const info = this.localVars.get(expr.name);
        if (info) {
            this.emit('MOV', [
                { type: 'reg', value: reg },
                { type: 'mem', base: this.getBasePtr(), offset: info.offset, size: info.size }
            ], `load ${expr.name}`, expr.line);
        } else {
            this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'imm', value: 0 }], `${expr.name} (unresolved)`, expr.line);
        }
    }

    generateMemberAccess(expr, reg) {
        if (expr.object.type === ASTType.IDENTIFIER) {
            const varInfo = this.localVars.get(expr.object.name);
            if (varInfo) {
                const structInfo = this.structs.get(varInfo.type.replace('*', '').trim());
                if (structInfo) {
                    const field = structInfo.getField(expr.member);
                    if (field) {
                        const offset = varInfo.offset + field.offset;
                        const fieldSize = this.getTypeSize(field.type);
                        this.emit('MOV', [
                            { type: 'reg', value: reg },
                            { type: 'mem', base: this.getBasePtr(), offset, size: fieldSize }
                        ], `load ${expr.object.name}.${expr.member}`, expr.line);
                    }
                }
            }
        }
    }

    generateAssignment(expr, reg) {
        if (expr.left.type === ASTType.MEMBER_ACCESS) {
            this.generateMemberAssignment(expr, reg);
            return;
        }
        if (expr.left.type === ASTType.IDENTIFIER) {
            const info = this.localVars.get(expr.left.name);
            if (info) {
                if (expr.op === '=') {
                    this.generateExpressionToReg(expr.right, this.getTempReg(0));
                    this.emit('MOV', [
                        { type: 'mem', base: this.getBasePtr(), offset: info.offset, size: info.size },
                        { type: 'reg', value: this.getTempReg(0) }
                    ], `${expr.left.name} = ${this.exprToString(expr.right)}`, expr.line);
                    this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'reg', value: this.getTempReg(0) }], '', expr.line);
                } else {
                    this.generateCompoundAssignment(expr.left, expr.op, expr.right, reg, expr.line);
                }
            }
        }
    }

    generateMemberAssignment(expr, reg) {
        const left = expr.left;
        if (left.object.type === ASTType.IDENTIFIER) {
            const varInfo = this.localVars.get(left.object.name);
            if (varInfo) {
                const structInfo = this.structs.get(varInfo.type.replace('*', '').trim());
                if (structInfo) {
                    const field = structInfo.getField(left.member);
                    if (field) {
                        const offset = varInfo.offset + field.offset;
                        const fieldSize = this.getTypeSize(field.type);

                        if (expr.op === '=') {
                            this.generateExpressionToReg(expr.right, this.getTempReg(0));
                            this.emit('MOV', [
                                { type: 'mem', base: this.getBasePtr(), offset, size: fieldSize },
                                { type: 'reg', value: this.getTempReg(0) }
                            ], `${left.object.name}.${left.member} = ${this.exprToString(expr.right)}`, expr.line);
                            this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'reg', value: this.getTempReg(0) }], '', expr.line);
                        } else {
                            // Compound assignment for members
                            this.emit('MOV', [
                                { type: 'reg', value: this.getTempReg(0) },
                                { type: 'mem', base: this.getBasePtr(), offset, size: fieldSize }
                            ], `load ${left.object.name}.${left.member}`, expr.line);
                            this.generateExpressionToReg(expr.right, this.getTempReg(1));
                            const realOp = expr.op.replace('=', '');
                            this.emitArithOp(realOp, this.getTempReg(0), this.getTempReg(0), this.getTempReg(1), expr.line);
                            this.emit('MOV', [
                                { type: 'mem', base: this.getBasePtr(), offset, size: fieldSize },
                                { type: 'reg', value: this.getTempReg(0) }
                            ], `store ${left.object.name}.${left.member}`, expr.line);
                            this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'reg', value: this.getTempReg(0) }], '', expr.line);
                        }
                    }
                }
            }
        }
    }

    generateCompoundAssignment(left, op, right, reg, line) {
        const info = this.localVars.get(left.name);
        if (!info) return;
        const realOp = op.replace('=', '');
        this.emit('MOV', [
            { type: 'reg', value: this.getTempReg(0) },
            { type: 'mem', base: this.getBasePtr(), offset: info.offset, size: info.size }
        ], `load ${left.name}`, line);
        this.generateExpressionToReg(right, this.getTempReg(1));
        this.emitArithOp(realOp, this.getTempReg(0), this.getTempReg(0), this.getTempReg(1), line);
        this.emit('MOV', [
            { type: 'mem', base: this.getBasePtr(), offset: info.offset, size: info.size },
            { type: 'reg', value: this.getTempReg(0) }
        ], `store ${left.name}`, line);
        this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'reg', value: this.getTempReg(0) }], '', line);
    }

    generateBinaryOp(expr, reg) {
        if (expr.op === '?:') {
            const elseLabel = this.newLabel('tern_else');
            const endLabel = this.newLabel('tern_end');
            this.generateExpressionToReg(expr.left, reg);
            this.emit('CMP', [{ type: 'reg', value: reg }, { type: 'imm', value: 0 }], `ternary condition`, expr.line);
            if (this.isArm) {
                this.emit('BEQ', [{ type: 'label', value: elseLabel }], '', expr.line);
            } else {
                this.emit('JE', [{ type: 'label', value: elseLabel }], '', expr.line);
            }
            this.generateExpressionToReg(expr.middle, reg);
            this.emit('JMP', [{ type: 'label', value: endLabel }], '', expr.line);
            this.emitLabel(elseLabel);
            this.generateExpressionToReg(expr.right, reg);
            this.emitLabel(endLabel);
            return;
        }

        const leftReg = this.getTempReg(0);
        const rightReg = this.getTempReg(1);
        this.generateExpressionToReg(expr.left, leftReg);
        this.generateExpressionToReg(expr.right, rightReg);

        const opMap = { '&&': 'AND', '||': 'OR' };
        if (opMap[expr.op]) {
            this.emit(opMap[expr.op], [{ type: 'reg', value: reg }, { type: 'reg', value: leftReg }, { type: 'reg', value: rightReg }], `${this.exprToString(expr.left)} ${expr.op} ${this.exprToString(expr.right)}`, expr.line);
            return;
        }

        this.emitArithOp(expr.op, reg, leftReg, rightReg, expr.line);
    }

    emitArithOp(op, dest, src1, src2, line) {
        const opMap = {
            '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
            '&': 'AND', '|': 'OR', '^': 'XOR',
            '<<': 'SHL', '>>': 'SHR',
            '==': 'CMP', '!=': 'CMP', '<': 'CMP', '>': 'CMP', '<=': 'CMP', '>=': 'CMP',
        };

        switch (op) {
            case '+': case '-': case '*': case '/':
                this.emit(opMap[op] === 'MUL' ? (this.isArm ? 'MUL' : 'IMUL') : opMap[op],
                    [{ type: 'reg', value: dest }, { type: 'reg', value: src1 }, { type: 'reg', value: src2 }],
                    `${this.exprToString({type:'reg',value:src1})} ${op} ${this.exprToString({type:'reg',value:src2})}`, line);
                break;
            case '%':
                this.emit('DIV', [{ type: 'reg', value: src1 }, { type: 'reg', value: src2 }], `mod`, line);
                this.emit('MOV', [{ type: 'reg', value: dest }, { type: 'reg', value: this.isX86 ? 'EDX' : 'R1' }], 'remainder', line);
                break;
            case '&': case '|': case '^':
                this.emit(opMap[op], [{ type: 'reg', value: dest }, { type: 'reg', value: src1 }, { type: 'reg', value: src2 }], `bitwise ${op}`, line);
                break;
            case '<<': case '>>':
                this.emit(opMap[op], [{ type: 'reg', value: dest }, { type: 'reg', value: src1 }, { type: 'reg', value: src2 }], `shift ${op}`, line);
                break;
            case '==': case '!=': case '<': case '>': case '<=': case '>=':
                this.emit('CMP', [{ type: 'reg', value: src1 }, { type: 'reg', value: src2 }], `compare ${op}`, line);
                this.emit('MOV', [{ type: 'reg', value: dest }, { type: 'imm', value: 1 }], `set true`, line);
                const falseLabel = this.newLabel('cmp_false');
                const branchInstr = this.getCmpBranchInstr(op, falseLabel);
                this.emit(branchInstr, [{ type: 'label', value: falseLabel }], `branch if false`, line);
                this.emit('MOV', [{ type: 'reg', value: dest }, { type: 'imm', value: 0 }], `set false`, line);
                this.emitLabel(falseLabel);
                break;
            default:
                this.emit('MOV', [{ type: 'reg', value: dest }, { type: 'reg', value: src1 }], `unknown op ${op}`, line);
        }
    }

    getCmpBranchInstr(op, label) {
        if (this.isArm) {
            switch (op) {
                case '==': return 'B_NE';
                case '!=': return 'B_EQ';
                case '<': return 'B_GE';
                case '>': return 'B_LE';
                case '<=': return 'B_GT';
                case '>=': return 'B_LT';
            }
        } else {
            switch (op) {
                case '==': return 'JNE';
                case '!=': return 'JE';
                case '<': return 'JGE';
                case '>': return 'JLE';
                case '<=': return 'JG';
                case '>=': return 'JL';
            }
        }
        return 'JMP';
    }

    generateUnaryOp(expr, reg) {
        if (expr.op === '-' && expr.isPrefix) {
            this.generateExpressionToReg(expr.operand, reg);
            this.emit('NEG', [{ type: 'reg', value: reg }], `negate`, expr.line);
        } else if (expr.op === '!' && expr.isPrefix) {
            this.generateExpressionToReg(expr.operand, reg);
            this.emit('NOT', [{ type: 'reg', value: reg }], `not`, expr.line);
        } else if (expr.op === '~' && expr.isPrefix) {
            this.generateExpressionToReg(expr.operand, reg);
            this.emit('NOT', [{ type: 'reg', value: reg }], `bitwise not`, expr.line);
        } else if ((expr.op === '++' || expr.op === '--') && expr.operand.type === ASTType.IDENTIFIER) {
            const info = this.localVars.get(expr.operand.name);
            if (info) {
                this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'mem', base: this.getBasePtr(), offset: info.offset, size: info.size }], `load ${expr.operand.name}`, expr.line);
                if (expr.isPrefix) {
                    this.emit(expr.op === '++' ? 'INC' : 'DEC', [{ type: 'reg', value: reg }], `${expr.op}${expr.operand.name}`, expr.line);
                    this.emit('MOV', [{ type: 'mem', base: this.getBasePtr(), offset: info.offset, size: info.size }, { type: 'reg', value: reg }], `store`, expr.line);
                } else {
                    this.emit('MOV', [{ type: 'reg', value: this.getTempReg(1) }, { type: 'reg', value: reg }], `copy`, expr.line);
                    this.emit(expr.op === '++' ? 'INC' : 'DEC', [{ type: 'reg', value: this.getTempReg(1) }], ``, expr.line);
                    this.emit('MOV', [{ type: 'mem', base: this.getBasePtr(), offset: info.offset, size: info.size }, { type: 'reg', value: this.getTempReg(1) }], `store`, expr.line);
                }
            }
        } else {
            this.generateExpressionToReg(expr.operand, reg);
        }
    }

    generateCall(expr, reg) {
        const funcName = expr.callee.name || 'unknown';
        const argRegs = this.arch.callingConv.argRegisters;

        for (let i = 0; i < expr.args.length; i++) {
            if (i < argRegs.length) {
                this.generateExpressionToReg(expr.args[i], argRegs[i]);
            } else {
                this.generateExpressionToReg(expr.args[i], this.getTempReg(0));
                this.emit('PUSH', [{ type: 'reg', value: this.getTempReg(0) }], `push arg ${i+1}`, expr.line);
            }
        }

        this.emit('CALL', [{ type: 'label', value: funcName }], `call ${funcName}()`, expr.line);
        this.emit('MOV', [{ type: 'reg', value: reg }, { type: 'reg', value: this.getReturnReg() }], `result of ${funcName}()`, expr.line);
    }

    // ============================================
    // Utilities
    // ============================================
    addString(str) {
        if (this.stringPool.has(str)) return this.stringPool.get(str);
        const label = `str_${this.stringPool.size}`;
        this.stringPool.set(str, { label, address: this.stringAddr });
        this.stringAddr += str.length + 1;
        return label;
    }

    exprToString(expr) {
        if (!expr) return '';
        switch (expr.type) {
            case ASTType.NUMBER_LITERAL: return expr.raw || String(expr.value);
            case ASTType.STRING_LITERAL: return `"${expr.value}"`;
            case ASTType.IDENTIFIER: return expr.name;
            case ASTType.MEMBER_ACCESS: return `${this.exprToString(expr.object)}.${expr.member}`;
            case ASTType.BINARY_OP: return `${this.exprToString(expr.left)} ${expr.op} ${this.exprToString(expr.right)}`;
            case ASTType.UNARY_OP: return `${expr.op}${this.exprToString(expr.operand)}`;
            case ASTType.ASSIGN_OP: return `${this.exprToString(expr.left)} ${expr.op} ${this.exprToString(expr.right)}`;
            case ASTType.CALL_EXPR: return `${this.exprToString(expr.callee)}(${expr.args.map(a => this.exprToString(a)).join(', ')})`;
            case ASTType.BOOL_LITERAL: return String(expr.value);
            case ASTType.CHAR_LITERAL: return `'${String.fromCharCode(expr.value)}'`;
            default: return '?';
        }
    }

    formatOperand(operand) {
        if (!operand) return '';
        switch (operand.type) {
            case 'reg': return operand.value;
            case 'imm':
                if (typeof operand.value === 'number' && operand.value < 0) {
                    return `${operand.value}`;
                }
                if (typeof operand.value === 'number' && operand.value > 0xFF) {
                    return `0x${operand.value.toString(16).toUpperCase()}`;
                }
                return `#${operand.value}`;
            case 'mem':
                const size = operand.size === 1 ? 'BYTE' : operand.size === 2 ? 'WORD' : operand.size === 8 ? 'QWORD' : 'DWORD';
                if (this.isArm) {
                    return `[${operand.base}${operand.offset !== undefined && operand.offset !== 0 ? ', #' + operand.offset : ''}]`;
                }
                return `${size} PTR [${operand.base}${operand.offset !== undefined && operand.offset !== 0 ? (operand.offset > 0 ? ' + ' : ' - ') + Math.abs(operand.offset) : ''}]`;
            case 'label': return operand.value;
            default: return String(operand.value || '');
        }
    }

    formatInstruction(instr) {
        const operands = instr.operands.map(o => this.formatOperand(o)).join(', ');
        return `${instr.opcode}${operands ? ' ' + operands : ''}`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CodeGenerator, StructInfo };
}
