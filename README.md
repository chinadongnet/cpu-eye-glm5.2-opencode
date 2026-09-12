# CPU Eye - C++ CPU Simulator

A web-based CPU simulator that compiles simplified C++ code, generates architecture-specific assembly, and visually simulates execution with dynamic register, memory, and pipeline updates.

## Features

- **C++ Code Editor** with syntax-aware parsing (classes, functions, loops, conditionals, bitwise ops)
- **4 CPU Architecture Models**: x86 (32-bit), x86_64 (64-bit), ARM (32-bit), ARM64
- **Dynamic Visualization**:
  - Live register values with modification highlighting
  - Stack / Heap / Data memory views with byte-level detail
  - 5-stage pipeline display (Fetch, Decode, Execute, Memory, Writeback)
  - Assembly view with current instruction tracking
  - Console output
- **10 Built-in Example Programs** for testing and demonstration
- **Execution Controls**: Run, Step, Pause, Reset with adjustable speed (0.5x to 20x)

## Quick Start

### Option 1: Open Directly

Open `index.html` in any modern web browser.

### Option 2: Local Server

```bash
# Python
python -m http.server 8080

# Node.js
npx serve

# PowerShell
Start-Process "http://localhost:8080"
```

Then navigate to `http://localhost:8080`.

### Option 3: Deploy to Web

Upload all files to any static web host (GitHub Pages, Netlify, Vercel, etc.).

## Usage

1. Select an architecture (x86 / x86_64 / ARM / ARM64)
2. Choose an example or type your own C++ code
3. Click **Compile** to generate assembly
4. Click **Run** for automatic execution or **Step** to execute one instruction at a time
5. Watch registers, memory, and pipeline update in real-time

## Supported C++ Subset

| Feature | Example |
|---------|---------|
| Classes/Structs | `class A { public: int x; int y; };` |
| Member access | `a.x = 1; a.y = 2;` |
| Variables | `int a = 10;` |
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Bitwise | `&`, `\|`, `^`, `<<`, `>>` |
| Comparison | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| Logical | `&&`, `\|\|`, `!` |
| Control flow | `if/else`, `while`, `for` |
| Functions | `int add(int a, int b) { return a + b; }` |
| Unary ops | `-x`, `!x`, `++i`, `i--` |

## Architecture Details

### x86 (32-bit)
- Registers: EAX, EBX, ECX, EDX, ESI, EDI, EBP, ESP, EIP
- Calling convention: cdecl (stack-based args)
- Stack grows downward from 0x7FFFFF00

### x86_64 (64-bit)
- Registers: RAX-R15, RBP, RSP, RIP
- Calling convention: System V ABI (RDI, RSI, RDX, RCX, R8, R9)
- 16-byte stack alignment

### ARM (32-bit)
- Registers: R0-R12, SP, LR, PC, CPSR
- Calling convention: AAPCS (R0-R3 for args)
- Frame pointer: R7

### ARM64 (AArch64)
- Registers: X0-X28, FP, LR, SP, PC
- Calling convention: AAPCS64 (X0-X7 for args)
- 16-byte stack alignment

## File Structure

```
cpu-eye-glm52-litellm/
├── index.html              # Main HTML layout
├── src/
│   ├── css/
│   │   └── style.css       # Dark IDE theme styling
│   └── js/
│       ├── architectures.js  # CPU arch definitions (registers, instructions, memory)
│       ├── compiler.js       # C++ lexer + parser (AST generation)
│       ├── codegen.js        # Code generator (AST -> architecture-specific assembly IR)
│       ├── cpu.js            # CPU simulator core (instruction execution, memory, pipeline)
│       ├── visualizer.js     # Dynamic UI updater (registers, memory, assembly, pipeline)
│       ├── examples.js       # 10 built-in C++ example programs
│       └── app.js            # Main controller (ties everything together)
├── test/
│   ├── test.js             # Class A verification test
│   └── test_all.js         # All examples verification
└── README.md
```

## Running Tests

```bash
node test/test.js       # Verify Class A example on all architectures
node test/test_all.js   # Run all 10 examples on all 4 architectures
```

## The Class A Example

```cpp
class A{
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
}
```

This example demonstrates:
- Class declaration with public members
- Struct memory layout (x at offset 0, y at offset 4)
- Stack allocation for local struct variable
- Member access and assignment
- Architecture-specific prologue/epilogue

All 4 architectures correctly set `a.x = 1` and `a.y = 2` in memory.
