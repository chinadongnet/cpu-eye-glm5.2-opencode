/* ============================================
   app.js
   Main Application Controller
   Ties together compiler, codegen, CPU, visualizer
   ============================================ */

class App {
    constructor() {
        this.currentArch = 'x86';
        this.arch = Architectures[this.currentArch];
        this.cpu = null;
        this.codeGen = null;
        this.visualizer = null;
        this.diagram = null;
        this.compiled = false;
        this.running = false;
        this.runTimer = null;
        this.runSpeed = 500;
        this.instructions = [];
        this.executedIndices = new Set();

        this.initUI();
        this.initVisualizer();
        this.initDiagram();
        this.loadExamples();
        this.loadDefaultCode();
        this.updateLineNumbers();
    }

    initUI() {
        document.querySelectorAll('.arch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchArchitecture(btn.dataset.arch);
            });
        });

        document.getElementById('btn-compile').addEventListener('click', () => this.compile());
        document.getElementById('btn-run').addEventListener('click', () => this.toggleRun());
        document.getElementById('btn-step').addEventListener('click', () => this.step());
        document.getElementById('btn-pause').addEventListener('click', () => this.pause());
        document.getElementById('btn-reset').addEventListener('click', () => this.reset());
        document.getElementById('btn-clear-console').addEventListener('click', () => {
            this.visualizer.clearConsole();
        });

        document.getElementById('speed-select').addEventListener('change', (e) => {
            this.runSpeed = parseInt(e.target.value);
            if (this.running) {
                this.pause();
                this.run();
            }
        });

        document.getElementById('example-select').addEventListener('change', (e) => {
            this.loadExample(e.target.value);
        });

        const editor = document.getElementById('code-editor');
        editor.addEventListener('input', () => {
            this.updateLineNumbers();
            this.setCompileStatus('', '');
            this.setButtonsState(false);
        });

        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + 4;
                this.updateLineNumbers();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.compile();
            }
        });

        document.querySelectorAll('.mem-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mem-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.visualizer.setMemMode(btn.textContent.toLowerCase());
                if (this.cpu) {
                    this.visualizer.renderMemory(this.cpu, new Set());
                }
            });
        });
    }

    initVisualizer() {
        this.visualizer = new Visualizer(this.arch);
        this.visualizer.setArchitecture(this.arch);
    }

    initDiagram() {
        this.diagram = new CPUDiagram(this.arch);
        this.diagram.mount('cpu-diagram');
    }

    loadExamples() {
        const select = document.getElementById('example-select');
        for (const key of Object.keys(Examples)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = Examples[key].name;
            select.appendChild(opt);
        }
    }

    loadDefaultCode() {
        document.getElementById('code-editor').value = Examples.classABasic.code;
        document.getElementById('example-select').value = 'classABasic';
    }

    loadExample(key) {
        if (Examples[key]) {
            document.getElementById('code-editor').value = Examples[key].code;
            this.updateLineNumbers();
            this.setCompileStatus('', '');
            this.setButtonsState(false);
        }
    }

    updateLineNumbers() {
        const editor = document.getElementById('code-editor');
        const lines = editor.value.split('\n').length;
        let nums = '';
        for (let i = 1; i <= lines; i++) {
            nums += i + '\n';
        }
        document.getElementById('line-numbers').textContent = nums;
    }

    switchArchitecture(archName) {
        if (this.running) this.pause();
        this.currentArch = archName;
        this.arch = Architectures[archName];

        document.querySelectorAll('.arch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.arch === archName);
        });

        this.visualizer.setArchitecture(this.arch);
        this.visualizer.clearConsole();
        this.diagram.setArchitecture(this.arch);

        const diagLabel = document.getElementById('diagram-arch-label');
        if (diagLabel) diagLabel.textContent = this.arch.displayName;

        this.setCompileStatus(`Switched to ${this.arch.displayName}`, 'info');

        if (this.compiled) {
            this.compile();
        } else {
            this.visualizer.renderAssembly([], -1);
            this.visualizer.renderRegisters({}, new Set(), {});
            this.visualizer.renderPipeline(null);
            this.visualizer.updateStatus(this.arch.displayName + ' - Ready', null);
            this.diagram.reset();
        }
    }

    compile() {
        this.pause();
        const source = document.getElementById('code-editor').value;

        try {
            const result = Compiler.compile(source);
            if (result.errors && result.errors.length > 0) {
                this.setCompileStatus(`Error: ${result.errors[0]}`, 'error');
                return;
            }

            this.codeGen = new CodeGenerator(this.arch);
            this.instructions = this.codeGen.generate(result.ast);

            this.cpu = new CPUSimulator(this.arch);
            this.cpu.load(this.instructions);

            this.visualizer.setCodeGen(this.codeGen);
            this.visualizer.renderAssembly(this.instructions, 0);
            this.visualizer.renderRegisters(this.cpu.registers, new Set(), this.cpu.flags);
            this.visualizer.renderMemory(this.cpu, new Set());
            this.visualizer.renderPipeline(null);
            this.visualizer.updateStatus('Compiled - Ready to run', this.cpu);
            this.visualizer.clearConsole();
            this.visualizer.appendConsole(`Compiled for ${this.arch.displayName}`, 'info');
            this.visualizer.appendConsole(`Generated ${this.instructions.length} instructions`, 'info');
            this.visualizer.appendConsole(`Structs: ${[...this.codeGen.structs.keys()].join(', ') || 'none'}`, 'info');

            this.diagram.setCodeGen(this.codeGen);
            this.diagram.reset();
            this.executedIndices.clear();

            this.setCompileStatus(`Success: ${this.instructions.length} instructions generated for ${this.arch.displayName}`, 'success');
            this.compiled = true;
            this.setButtonsState(true);

        } catch (err) {
            console.error('Compilation error:', err);
            this.setCompileStatus(`Compilation error: ${err.message}`, 'error');
            this.visualizer.appendConsole(`Error: ${err.message}`, 'error');
            this.compiled = false;
            this.setButtonsState(false);
        }
    }

    step() {
        if (!this.cpu || this.cpu.halted) {
            this.visualizer.appendConsole('Program has finished execution', 'warning');
            return;
        }

        try {
            const prevIndex = this.cpu.instructionIndex;
            const result = this.cpu.step();
            this.executedIndices.add(prevIndex);
            this.visualizer.update(this.cpu, result);
            this.visualizer.updateStatus('Stepping...', this.cpu);
            this.diagram.update(this.cpu, result);
            this.markExecutedInstructions();

            if (result.halted) {
                this.pause();
                this.visualizer.updateStatus('Halted', this.cpu);
                this.visualizer.appendConsole(`Execution complete. ${this.cpu.executedCount} instructions, ${this.cpu.cycles} cycles.`, 'success');
                this.visualizer.appendConsole(`Return value: ${this.cpu.returnValue}`, 'success');
            }
        } catch (err) {
            this.visualizer.updateStatus('Error: ' + err.message, this.cpu);
            this.visualizer.appendConsole('Runtime error: ' + err.message, 'error');
            console.error('CPU simulation error:', err);
        }
    }

    run() {
        if (!this.cpu || this.cpu.halted) {
            this.visualizer.appendConsole('CPU not ready or already halted', 'warning');
            return;
        }
        this.running = true;
        this.setButtonsState(true, true);
        this.visualizer.updateStatus('Running...', this.cpu);

        const doStep = () => {
            if (!this.cpu || this.cpu.halted) {
                this.pause();
                return;
            }
            try {
                const prevIndex = this.cpu.instructionIndex;
                const result = this.cpu.step();
                this.executedIndices.add(prevIndex);
                this.visualizer.update(this.cpu, result);
                this.diagram.update(this.cpu, result);
                this.markExecutedInstructions();

                if (result.halted) {
                    this.pause();
                    this.visualizer.updateStatus('Halted', this.cpu);
                    this.visualizer.appendConsole(`Execution complete. ${this.cpu.executedCount} instructions, ${this.cpu.cycles} cycles.`, 'success');
                    this.visualizer.appendConsole(`Return value: ${this.cpu.returnValue}`, 'success');
                }
            } catch (err) {
                this.pause();
                this.visualizer.updateStatus('Error: ' + err.message, this.cpu);
                this.visualizer.appendConsole('Runtime error: ' + err.message, 'error');
                console.error('CPU simulation error:', err);
            }
        };

        doStep();
        this.runTimer = setInterval(doStep, this.runSpeed);
    }

    pause() {
        this.running = false;
        if (this.runTimer) {
            clearInterval(this.runTimer);
            this.runTimer = null;
        }
        this.setButtonsState(true, false);
        if (this.cpu) {
            this.visualizer.updateStatus('Paused', this.cpu);
        }
    }

    toggleRun() {
        if (this.running) {
            this.pause();
        } else {
            this.run();
        }
    }

    reset() {
        this.pause();
        if (this.cpu && this.instructions.length > 0) {
            this.cpu.reset();
            this.cpu.load(this.instructions);
            this.executedIndices.clear();
            this.visualizer.renderAssembly(this.instructions, 0);
            this.visualizer.renderRegisters(this.cpu.registers, new Set(), this.cpu.flags);
            this.visualizer.renderMemory(this.cpu, new Set());
            this.visualizer.renderPipeline(null);
            this.visualizer.updateStatus('Reset', this.cpu);
            this.visualizer.clearConsole();
            this.visualizer.appendConsole('CPU reset', 'info');
            this.diagram.reset();
        }
    }

    markExecutedInstructions() {
        const allInstrs = document.querySelectorAll('#assembly-view .asm-instruction');
        allInstrs.forEach((el, i) => {
            if (this.executedIndices.has(i)) {
                el.classList.add('executed');
            } else {
                el.classList.remove('executed');
            }
        });
    }

    setCompileStatus(message, type) {
        const el = document.getElementById('compile-status');
        el.textContent = message || '';
        el.className = 'compile-status' + (type ? ' ' + type : '');
    }

    setButtonsState(compiled, running) {
        const isRunning = running === true;
        document.getElementById('btn-run').disabled = !compiled;
        document.getElementById('btn-step').disabled = !compiled || isRunning;
        document.getElementById('btn-pause').disabled = !isRunning;
        document.getElementById('btn-reset').disabled = !compiled;

        const runBtn = document.getElementById('btn-run');
        runBtn.textContent = isRunning ? 'Running...' : 'Run';
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
});
