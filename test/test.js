// Test script for CPU Eye - verifies compiler, codegen, and CPU execution
// Run with: node test/test.js

// Load modules
const path = require('path');
const fs = require('fs');

// Load source files
const archSrc = fs.readFileSync(path.join(__dirname, '../src/js/architectures.js'), 'utf8');
const compilerSrc = fs.readFileSync(path.join(__dirname, '../src/js/compiler.js'), 'utf8');
const codegenSrc = fs.readFileSync(path.join(__dirname, '../src/js/codegen.js'), 'utf8');
const cpuSrc = fs.readFileSync(path.join(__dirname, '../src/js/cpu.js'), 'utf8');

// Evaluate in a shared global context (indirect eval runs in global scope)
const vm = require('vm');
vm.runInThisContext(archSrc);
vm.runInThisContext(compilerSrc);
vm.runInThisContext(codegenSrc);
vm.runInThisContext(cpuSrc);

const testCode = `class A{
public:
    int x;
    int y;
};

int main()
{
    A a;
    a.x = 1;
    a.y = 2;
    return 0;
}`;

console.log('='.repeat(60));
console.log('CPU Eye Test - Class A Example');
console.log('='.repeat(60));
console.log('\nSource code:');
console.log(testCode);
console.log('\n' + '='.repeat(60));

// Test for each architecture
for (const archName of ['x86', 'x86_64', 'arm32', 'arm64']) {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Testing architecture: ${archName}`);
    console.log('─'.repeat(40));

    const arch = Architectures[archName];

    // Compile
    const result = Compiler.compile(testCode);
    console.log(`AST declarations: ${result.ast.declarations.length}`);
    console.log(`Classes: ${[...result.classes.keys()].join(', ')}`);

    // Code generation
    const codeGen = new CodeGenerator(arch);
    const instructions = codeGen.generate(result.ast);
    console.log(`Generated ${instructions.length} instructions`);

    // Print assembly
    console.log('\nAssembly output:');
    for (const instr of instructions) {
        if (instr.label) console.log(`${instr.label}:`);
        const formatted = codeGen.formatInstruction(instr);
        const addr = `0x${instr.address.toString(16).toUpperCase().padStart(8, '0')}`;
        const comment = instr.comment ? `  ${arch.commentChar} ${instr.comment}` : '';
        console.log(`  ${addr}  ${formatted}${comment}`);
    }

    // CPU simulation
    const cpu = new CPUSimulator(arch);
    cpu.load(instructions);

    console.log('\nExecution trace:');
    let stepCount = 0;
    let bpDuringMain = 0;
    while (!cpu.halted && stepCount < 200) {
        const stepResult = cpu.step();
        stepCount++;
        const instr = stepResult.instr;
        if (instr) {
            const formatted = codeGen.formatInstruction(instr);
            const modRegs = stepResult.modifiedRegs.join(', ');
            console.log(`  [${stepCount}] ${formatted}  | modified: ${modRegs || 'none'}`);
            // Save BP when we're inside main (after MOV EBP, ESP equivalent)
            if (instr.opcode === 'MOV' && instr.operands.length === 2 &&
                instr.operands[0].type === 'reg' && instr.operands[0].value === arch.bpRegister &&
                instr.operands[1].type === 'reg' && instr.operands[1].value === arch.stackRegister) {
                bpDuringMain = cpu.getReg(arch.bpRegister);
            }
        }
        if (stepResult.halted) {
            console.log(`  HALTED. Exit code: ${cpu.returnValue}`);
            break;
        }
    }

    console.log(`\nTotal instructions executed: ${cpu.executedCount}`);
    console.log(`Total cycles: ${cpu.cycles}`);
    console.log(`Return value: ${cpu.returnValue}`);

    // Verify memory state - check that a.x = 1 and a.y = 2
    const bp = cpu.getReg(arch.bpRegister);
    const structInfo = codeGen.structs.get('A');
    if (structInfo) {
        console.log(`\nStruct A size: ${structInfo.size}`);
        console.log(`Struct A fields:`);
        for (const [name, field] of structInfo.fields) {
            console.log(`  ${name}: offset=${field.offset}, type=${field.type}`);
        }
    }

    // Check stack memory for struct values
    console.log('\nStack memory dump (around BP during main):');
    console.log(`  BP during main: 0x${bpDuringMain.toString(16).toUpperCase()}`);
    for (let offset = -16; offset <= 8; offset += 4) {
        const addr = bpDuringMain + offset;
        const val = cpu.readMem(addr, 4);
        console.log(`  [BP${offset >= 0 ? '+' : ''}${offset}] (0x${addr.toString(16)}) = 0x${val.toString(16).toUpperCase()} (${val})`);
    }

    // Verify correctness
    console.log('\nVerification:');
    const xOffset = structInfo ? structInfo.getFieldOffset('x') : 0;
    const yOffset = structInfo ? structInfo.getFieldOffset('y') : 4;
    const aInfo = codeGen.localVars.get('a');
    if (aInfo) {
        console.log(`  a is at BP${aInfo.offset}, size=${aInfo.size}`);
        const xAddr = bpDuringMain + aInfo.offset + xOffset;
        const yAddr = bpDuringMain + aInfo.offset + yOffset;
        console.log(`  xAddr=0x${xAddr.toString(16)}, yAddr=0x${yAddr.toString(16)}`);
        const xVal = cpu.readMem(xAddr, 4);
        const yVal = cpu.readMem(yAddr, 4);
        console.log(`  a.x = ${xVal} (expected: 1) -> ${xVal === 1 ? 'PASS' : 'FAIL'}`);
        console.log(`  a.y = ${yVal} (expected: 2) -> ${yVal === 2 ? 'PASS' : 'FAIL'}`);
    } else {
        console.log('  Could not find variable "a" in localVars');
    }
}

console.log('\n' + '='.repeat(60));
console.log('Test complete');
console.log('='.repeat(60));
