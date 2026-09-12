/* ============================================
   examples.js
   Default C++ Example Programs
   ============================================ */

const Examples = {
    classABasic: {
        name: 'Class A - Basic Members',
        description: 'Simple class with int members x and y',
        code: `class A{
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
}`,
    },

    arithmetic: {
        name: 'Arithmetic Operations',
        description: 'Basic integer arithmetic and variables',
        code: `int main()
{
    int a = 10;
    int b = 20;
    int c = a + b;
    int d = a * b;
    int e = d - c;
    return e;
}`,
    },

    loopSum: {
        name: 'Loop - Sum 1 to N',
        description: 'For loop computing sum of 1..100',
        code: `int main()
{
    int sum = 0;
    for (int i = 1; i <= 100; i++)
    {
        sum = sum + i;
    }
    return sum;
}`,
    },

    ifElse: {
        name: 'If-Else Branching',
        description: 'Conditional branching with if/else',
        code: `int main()
{
    int x = 42;
    int result = 0;
    if (x > 40)
    {
        result = 1;
    }
    else
    {
        result = 2;
    }
    return result;
}`,
    },

    whileLoop: {
        name: 'While Loop - Factorial',
        description: 'Compute factorial using while loop',
        code: `int main()
{
    int n = 5;
    int result = 1;
    while (n > 0)
    {
        result = result * n;
        n = n - 1;
    }
    return result;
}`,
    },

    classPoint: {
        name: 'Class Point - Distance',
        description: 'Class with multiple fields and arithmetic',
        code: `class Point{
public:
    int x;
    int y;
    int z;
};

int main()
{
    Point p;
    p.x = 3;
    p.y = 4;
    p.z = 5;
    int sum = p.x + p.y + p.z;
    return sum;
}`,
    },

    functionCall: {
        name: 'Function Call',
        description: 'Function with parameters and return value',
        code: `int add(int a, int b)
{
    return a + b;
}

int main()
{
    int x = 15;
    int y = 27;
    int result = add(x, y);
    return result;
}`,
    },

    nestedStruct: {
        name: 'Nested Class Members',
        description: 'Two classes with member access',
        code: `class Inner{
public:
    int value;
};

class Outer{
public:
    int id;
    Inner inner;
};

int main()
{
    Outer o;
    o.id = 1;
    o.inner.value = 99;
    return o.inner.value;
}`,
    },

    bitwise: {
        name: 'Bitwise Operations',
        description: 'AND, OR, XOR, shifts',
        code: `int main()
{
    int a = 0xFF;
    int b = 0x0F;
    int c = a & b;
    int d = a | b;
    int e = a ^ b;
    int f = a << 4;
    int g = a >> 4;
    return g;
}`,
    },

    complexFlow: {
        name: 'Complex Control Flow',
        description: 'Nested loops with conditionals',
        code: `int main()
{
    int total = 0;
    for (int i = 0; i < 10; i++)
    {
        if (i % 2 == 0)
        {
            total = total + i;
        }
        else
        {
            total = total - i;
        }
    }
    return total;
}`,
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Examples;
}
