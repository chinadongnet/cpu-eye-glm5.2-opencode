const vm = require('vm');
const fs = require('fs');
const path = require('path');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/architectures.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/compiler.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/codegen.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/cpu.js'), 'utf8'));

const arch = Architectures.x86_64;
const code = 'class A{public: int x; int y;}; int main() { A a; a.x = 1; a.y = 2; return 0; }';
const result = Compiler.compile(code);
const codeGen = new CodeGenerator(arch);
const instructions = codeGen.generate(result.ast);
const cpu = new CPUSimulator(arch);
cpu.load(instructions);

let step = 0;
while (!cpu.halted && step < 25) {
    const r = cpu.step();
    step++;
    const instr = r.instr;
    if (instr && instr.opcode === 'MOV' && instr.operands[0] && instr.operands[0].type === 'mem') {
        const addr = cpu.getMemAddr(instr.operands[0].base, instr.operands[0].offset);
        const val = cpu.getOperandValue(instr.operands[1]);
        const readBack = cpu.readMem(addr, instr.operands[0].size || 4);
        console.log('Step ' + step + ': WRITE addr=0x' + addr.toString(16) + ' val=' + val + ' readBack=' + readBack + ' | ' + codeGen.formatInstruction(instr));
    }
    if (r.halted) break;
}
