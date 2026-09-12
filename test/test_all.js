const vm = require('vm');
const fs = require('fs');
const path = require('path');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/architectures.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/compiler.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/codegen.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/cpu.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js/examples.js'), 'utf8'));

let allPass = true;
let totalTests = 0;
let totalPass = 0;

for (const [exampleKey, example] of Object.entries(Examples)) {
    console.log('\n' + '='.repeat(50));
    console.log('Example: ' + example.name);
    console.log('='.repeat(50));

    for (const archName of ['x86', 'x86_64', 'arm32', 'arm64']) {
        const arch = Architectures[archName];
        try {
            const result = Compiler.compile(example.code);
            const codeGen = new CodeGenerator(arch);
            const instructions = codeGen.generate(result.ast);
            const cpu = new CPUSimulator(arch);
            cpu.load(instructions);

            let steps = 0;
            while (!cpu.halted && steps < 500) {
                cpu.step();
                steps++;
            }

            const pass = cpu.halted && steps < 500;
            totalTests++;
            if (pass) totalPass++;
            if (!pass) allPass = false;
            console.log('  ' + archName + ': ' + (pass ? 'PASS' : 'FAIL') + ' (' + steps + ' steps, ' + cpu.executedCount + ' instrs, ret=' + cpu.returnValue + ')');
        } catch (e) {
            totalTests++;
            allPass = false;
            console.log('  ' + archName + ': ERROR - ' + e.message);
        }
    }
}

console.log('\n' + '='.repeat(50));
console.log('Total: ' + totalPass + '/' + totalTests + ' passed');
console.log(allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
console.log('='.repeat(50));
