/* ============================================
   compiler.js
   C++ Lexer + Parser
   Parses a simplified subset of C++ into an AST
   ============================================ */

// ============================================
// Token Types
// ============================================
const TokenType = {
    KEYWORD: 'KEYWORD',
    IDENTIFIER: 'IDENTIFIER',
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    CHAR: 'CHAR',
    OPERATOR: 'OPERATOR',
    PUNCTUATION: 'PUNCTUATION',
    COMMENT: 'COMMENT',
    WHITESPACE: 'WHITESPACE',
    PREPROCESSOR: 'PREPROCESSOR',
    EOF: 'EOF',
};

const KEYWORDS = new Set([
    'int', 'char', 'float', 'double', 'void', 'bool', 'long', 'short',
    'unsigned', 'signed', 'const', 'static', 'return', 'if', 'else',
    'while', 'for', 'do', 'break', 'continue', 'switch', 'case', 'default',
    'struct', 'class', 'public', 'private', 'protected', 'namespace',
    'using', 'true', 'false', 'new', 'delete', 'sizeof', 'this', 'nullptr',
    'auto', 'template', 'typename',
]);

// ============================================
// Lexer
// ============================================
class Lexer {
    constructor(source) {
        this.source = source;
        this.pos = 0;
        this.line = 1;
        this.col = 1;
        this.tokens = [];
    }

    peek(offset = 0) {
        return this.source[this.pos + offset] || '';
    }

    advance() {
        const ch = this.source[this.pos];
        this.pos++;
        if (ch === '\n') {
            this.line++;
            this.col = 1;
        } else {
            this.col++;
        }
        return ch;
    }

    tokenize() {
        while (this.pos < this.source.length) {
            const ch = this.peek();
            if (ch === '/' && this.peek(1) === '/') {
                this.readLineComment();
            } else if (ch === '/' && this.peek(1) === '*') {
                this.readBlockComment();
            } else if (ch === '#') {
                this.readPreprocessor();
            } else if (/\s/.test(ch)) {
                this.readWhitespace();
            } else if (/[a-zA-Z_]/.test(ch)) {
                this.readIdentifier();
            } else if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(this.peek(1)))) {
                this.readNumber();
            } else if (ch === '"') {
                this.readString();
            } else if (ch === "'") {
                this.readChar();
            } else {
                this.readOperator();
            }
        }
        this.tokens.push({ type: TokenType.EOF, value: '', line: this.line, col: this.col });
        return this.tokens;
    }

    readLineComment() {
        let val = '';
        while (this.pos < this.source.length && this.peek() !== '\n') {
            val += this.advance();
        }
        this.tokens.push({ type: TokenType.COMMENT, value: val, line: this.line, col: this.col });
    }

    readBlockComment() {
        let val = '';
        this.advance(); this.advance();
        while (this.pos < this.source.length && !(this.peek() === '*' && this.peek(1) === '/')) {
            val += this.advance();
        }
        if (this.pos < this.source.length) {
            this.advance(); this.advance();
        }
        this.tokens.push({ type: TokenType.COMMENT, value: val, line: this.line, col: this.col });
    }

    readPreprocessor() {
        let val = '';
        while (this.pos < this.source.length && this.peek() !== '\n') {
            if (this.peek() === '\\' && this.peek(1) === '\n') {
                this.advance(); this.advance();
                val += '\n';
            } else {
                val += this.advance();
            }
        }
        this.tokens.push({ type: TokenType.PREPROCESSOR, value: val, line: this.line, col: this.col });
    }

    readWhitespace() {
        let val = '';
        while (this.pos < this.source.length && /\s/.test(this.peek())) {
            val += this.advance();
        }
        this.tokens.push({ type: TokenType.WHITESPACE, value: val, line: this.line, col: this.col });
    }

    readIdentifier() {
        let val = '';
        while (this.pos < this.source.length && /[a-zA-Z0-9_]/.test(this.peek())) {
            val += this.advance();
        }
        const type = KEYWORDS.has(val) ? TokenType.KEYWORD : TokenType.IDENTIFIER;
        this.tokens.push({ type, value: val, line: this.line, col: this.col });
    }

    readNumber() {
        let val = '';
        let isHex = false;
        let isFloat = false;
        if (this.peek() === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
            isHex = true;
            val += this.advance(); val += this.advance();
            while (this.pos < this.source.length && /[0-9a-fA-F]/.test(this.peek())) {
                val += this.advance();
            }
        } else {
            while (this.pos < this.source.length && /[0-9]/.test(this.peek())) {
                val += this.advance();
            }
            if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
                isFloat = true;
                val += this.advance();
                while (this.pos < this.source.length && /[0-9]/.test(this.peek())) {
                    val += this.advance();
                }
            }
            if (this.peek() === 'e' || this.peek() === 'E') {
                isFloat = true;
                val += this.advance();
                if (this.peek() === '+' || this.peek() === '-') val += this.advance();
                while (this.pos < this.source.length && /[0-9]/.test(this.peek())) {
                    val += this.advance();
                }
            }
        }
        if (this.peek() === 'f' || this.peek() === 'F' || this.peek() === 'L' || this.peek() === 'l' || this.peek() === 'u' || this.peek() === 'U') {
            val += this.advance();
        }
        let numValue;
        if (isFloat) {
            numValue = parseFloat(val.replace(/[fFlLuU]$/, ''));
        } else if (isHex) {
            numValue = parseInt(val.replace(/[fFlLuU]$/, ''), 16);
        } else {
            numValue = parseInt(val.replace(/[fFlLuU]$/, ''));
        }
        this.tokens.push({ type: TokenType.NUMBER, value: val, numValue, isFloat, line: this.line, col: this.col });
    }

    readString() {
        this.advance();
        let val = '';
        while (this.pos < this.source.length && this.peek() !== '"') {
            if (this.peek() === '\\') {
                this.advance();
                const esc = this.advance();
                switch (esc) {
                    case 'n': val += '\n'; break;
                    case 't': val += '\t'; break;
                    case 'r': val += '\r'; break;
                    case '\\': val += '\\'; break;
                    case '"': val += '"'; break;
                    case '0': val += '\0'; break;
                    default: val += esc; break;
                }
            } else {
                val += this.advance();
            }
        }
        if (this.peek() === '"') this.advance();
        this.tokens.push({ type: TokenType.STRING, value: val, line: this.line, col: this.col });
    }

    readChar() {
        this.advance();
        let val = '';
        while (this.pos < this.source.length && this.peek() !== "'") {
            if (this.peek() === '\\') {
                this.advance();
                const esc = this.advance();
                switch (esc) {
                    case 'n': val += '\n'; break;
                    case 't': val += '\t'; break;
                    case '0': val += '\0'; break;
                    default: val += esc; break;
                }
            } else {
                val += this.advance();
            }
        }
        if (this.peek() === "'") this.advance();
        this.tokens.push({ type: TokenType.CHAR, value: val, charCode: val.charCodeAt(0) || 0, line: this.line, col: this.col });
    }

    readOperator() {
        const three = this.source.substr(this.pos, 3);
        const two = this.source.substr(this.pos, 2);
        const threeCharOps = ['<<=', '>>=', '...'];
        const twoCharOps = ['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '<<', '>>', '->', '::'];
        const oneCharOps = ['+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', '.', ','];

        if (threeCharOps.includes(three)) {
            this.pos += 3; this.col += 3;
            this.tokens.push({ type: TokenType.OPERATOR, value: three, line: this.line, col: this.col });
        } else if (twoCharOps.includes(two)) {
            this.pos += 2; this.col += 2;
            this.tokens.push({ type: TokenType.OPERATOR, value: two, line: this.line, col: this.col });
        } else if (oneCharOps.includes(this.peek())) {
            const ch = this.advance();
            this.tokens.push({ type: TokenType.OPERATOR, value: ch, line: this.line, col: this.col });
        } else {
            const ch = this.advance();
            this.tokens.push({ type: TokenType.PUNCTUATION, value: ch, line: this.line, col: this.col });
        }
    }
}

// ============================================
// AST Node Types
// ============================================
const ASTType = {
    PROGRAM: 'Program',
    CLASS_DECL: 'ClassDecl',
    VAR_DECL: 'VarDecl',
    FUNC_DECL: 'FuncDecl',
    PARAM: 'Param',
    BLOCK: 'Block',
    IF_STMT: 'IfStmt',
    WHILE_STMT: 'WhileStmt',
    FOR_STMT: 'ForStmt',
    RETURN_STMT: 'ReturnStmt',
    BREAK_STMT: 'BreakStmt',
    CONTINUE_STMT: 'ContinueStmt',
    EXPR_STMT: 'ExprStmt',
    BINARY_OP: 'BinaryOp',
    UNARY_OP: 'UnaryOp',
    ASSIGN_OP: 'AssignOp',
    MEMBER_ACCESS: 'MemberAccess',
    CALL_EXPR: 'CallExpr',
    IDENTIFIER: 'Identifier',
    NUMBER_LITERAL: 'NumberLiteral',
    STRING_LITERAL: 'StringLiteral',
    CHAR_LITERAL: 'CharLiteral',
    BOOL_LITERAL: 'BoolLiteral',
};

// ============================================
// Parser
// ============================================
class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
        this.classes = new Map();
        this.functions = new Map();
    }

    current() { return this.tokens[this.pos]; }
    peek(offset = 0) { return this.tokens[this.pos + offset] || { type: TokenType.EOF }; }

    skipTrivia() {
        while (this.current().type === TokenType.WHITESPACE ||
               this.current().type === TokenType.COMMENT ||
               this.current().type === TokenType.PREPROCESSOR) {
            this.pos++;
        }
    }

    advance() {
        this.skipTrivia();
        return this.tokens[this.pos++];
    }

    expect(type, value) {
        this.skipTrivia();
        const tok = this.current();
        if (tok.type !== type || (value && tok.value !== value)) {
            throw new Error(`Parse error at line ${tok.line}: expected ${value || type}, got '${tok.value}' (${tok.type})`);
        }
        return this.advance();
    }

    match(type, value) {
        this.skipTrivia();
        const tok = this.current();
        if (tok.type === type && (!value || tok.value === value)) {
            return this.advance();
        }
        return null;
    }

    check(type, value) {
        this.skipTrivia();
        const tok = this.current();
        return tok.type === type && (!value || tok.value === value);
    }

    isTypeKeyword() {
        const tok = this.current();
        if (tok.type !== TokenType.KEYWORD) return false;
        return ['int', 'char', 'float', 'double', 'void', 'bool', 'long', 'short', 'unsigned', 'signed', 'auto'].includes(tok.value);
    }

    parseType() {
        let typeStr = '';
        if (this.match(TokenType.KEYWORD, 'unsigned') || this.match(TokenType.KEYWORD, 'signed')) {
            typeStr += this.tokens[this.pos - 1].value + ' ';
        }
        if (this.match(TokenType.KEYWORD, 'long')) {
            typeStr += 'long ';
            if (this.match(TokenType.KEYWORD, 'long')) typeStr += 'long ';
            if (this.match(TokenType.KEYWORD, 'int')) typeStr += 'int ';
        } else if (this.isTypeKeyword()) {
            typeStr += this.advance().value;
        } else if (this.check(TokenType.IDENTIFIER)) {
            typeStr += this.advance().value;
        }
        while (this.match(TokenType.OPERATOR, '*')) {
            typeStr += '*';
        }
        while (this.match(TokenType.OPERATOR, '&')) {
            typeStr += '&';
        }
        return typeStr.trim();
    }

    parse() {
        const program = { type: ASTType.PROGRAM, declarations: [], line: 1 };
        this.skipTrivia();

        while (this.current().type !== TokenType.EOF) {
            const decl = this.parseTopLevelDecl();
            if (decl) program.declarations.push(decl);
        }
        return program;
    }

    parseTopLevelDecl() {
        this.skipTrivia();
        const tok = this.current();
        if (tok.type === TokenType.EOF) return null;

        if (tok.type === TokenType.KEYWORD && (tok.value === 'class' || tok.value === 'struct')) {
            return this.parseClassDecl();
        }

        if (tok.type === TokenType.KEYWORD && tok.value === 'namespace') {
            this.advance();
            this.expect(TokenType.IDENTIFIER);
            this.expect(TokenType.PUNCTUATION, '{');
            const decls = [];
            while (!this.check(TokenType.PUNCTUATION, '}') && this.current().type !== TokenType.EOF) {
                const d = this.parseTopLevelDecl();
                if (d) decls.push(d);
            }
            this.expect(TokenType.PUNCTUATION, '}');
            return { type: ASTType.PROGRAM, declarations: decls, line: tok.line, isNamespace: true };
        }

        if (tok.type === TokenType.KEYWORD && tok.value === 'using') {
            while (this.current().type !== TokenType.PUNCTUATION || this.current().value !== ';') {
                if (this.current().type === TokenType.EOF) break;
                this.advance();
            }
            this.match(TokenType.PUNCTUATION, ';');
            return null;
        }

        return this.parseVarOrFuncDecl();
    }

    parseClassDecl() {
        const kw = this.advance();
        const nameTok = this.expect(TokenType.IDENTIFIER);
        const name = nameTok.value;
        this.expect(TokenType.PUNCTUATION, '{');
        const members = { fields: [], methods: [] };
        let accessMode = kw.value === 'class' ? 'private' : 'public';

        while (!this.check(TokenType.PUNCTUATION, '}') && this.current().type !== TokenType.EOF) {
            if (this.match(TokenType.KEYWORD, 'public')) {
                accessMode = 'public';
                this.expect(TokenType.PUNCTUATION, ':');
                continue;
            }
            if (this.match(TokenType.KEYWORD, 'private')) {
                accessMode = 'private';
                this.expect(TokenType.PUNCTUATION, ':');
                continue;
            }
            if (this.match(TokenType.KEYWORD, 'protected')) {
                accessMode = 'protected';
                this.expect(TokenType.PUNCTUATION, ':');
                continue;
            }

            const type = this.parseType();
            if (!type) { this.advance(); continue; }
            const memberNameTok = this.expect(TokenType.IDENTIFIER);
            const memberName = memberNameTok.value;

            if (this.check(TokenType.PUNCTUATION, '(')) {
                const func = this.parseFuncParamsAndBody(type, memberName);
                func.access = accessMode;
                members.methods.push(func);
            } else {
                let initVal = null;
                if (this.match(TokenType.OPERATOR, '=')) {
                    initVal = this.parseExpression();
                }
                this.expect(TokenType.PUNCTUATION, ';');
                members.fields.push({ name: memberName, type, initVal, access: accessMode, line: memberNameTok.line });
            }
        }
        this.expect(TokenType.PUNCTUATION, '}');
        this.match(TokenType.PUNCTUATION, ';');

        const classDecl = { type: ASTType.CLASS_DECL, name, members, line: kw.line };
        this.classes.set(name, classDecl);
        return classDecl;
    }

    parseFuncParamsAndBody(returnType, name) {
        this.expect(TokenType.PUNCTUATION, '(');
        const params = [];
        while (!this.check(TokenType.PUNCTUATION, ')') && this.current().type !== TokenType.EOF) {
            const paramType = this.parseType();
            const paramNameTok = this.expect(TokenType.IDENTIFIER);
            params.push({ type: ASTType.PARAM, paramType, paramName: paramNameTok.value, line: paramNameTok.line });
            if (!this.match(TokenType.OPERATOR, ',') && !this.match(TokenType.PUNCTUATION, ',')) break;
        }
        this.expect(TokenType.PUNCTUATION, ')');

        let body = null;
        if (this.check(TokenType.PUNCTUATION, '{')) {
            body = this.parseBlock();
        } else {
            this.match(TokenType.PUNCTUATION, ';');
        }

        const func = { type: ASTType.FUNC_DECL, name, returnType, params, body, line: name ? 0 : 0 };
        this.functions.set(name, func);
        return func;
    }

    parseVarOrFuncDecl() {
        const startLine = this.current().line;
        const varType = this.parseType();
        if (!varType) { this.advance(); return null; }

        const nameTok = this.match(TokenType.IDENTIFIER);
        if (!nameTok) { this.advance(); return null; }
        const name = nameTok.value;

        if (this.check(TokenType.PUNCTUATION, '(')) {
            return this.parseFuncParamsAndBody(varType, name);
        }

        let initVal = null;
        if (this.match(TokenType.OPERATOR, '=')) {
            initVal = this.parseExpression();
        }
        this.expect(TokenType.PUNCTUATION, ';');

        return { type: ASTType.VAR_DECL, varType, name, initVal, line: startLine };
    }

    parseBlock() {
        this.expect(TokenType.PUNCTUATION, '{');
        const statements = [];
        while (!this.check(TokenType.PUNCTUATION, '}') && this.current().type !== TokenType.EOF) {
            const stmt = this.parseStatement();
            if (stmt) statements.push(stmt);
        }
        this.expect(TokenType.PUNCTUATION, '}');
        return { type: ASTType.BLOCK, statements, line: 0 };
    }

    parseStatement() {
        this.skipTrivia();
        const tok = this.current();
        if (tok.type === TokenType.EOF) return null;

        if (tok.type === TokenType.PUNCTUATION && tok.value === '{') {
            return this.parseBlock();
        }
        if (tok.type === TokenType.KEYWORD) {
            switch (tok.value) {
                case 'if': return this.parseIfStmt();
                case 'while': return this.parseWhileStmt();
                case 'for': return this.parseForStmt();
                case 'return': return this.parseReturnStmt();
                case 'break':
                    this.advance();
                    this.match(TokenType.PUNCTUATION, ';');
                    return { type: ASTType.BREAK_STMT, line: tok.line };
                case 'continue':
                    this.advance();
                    this.match(TokenType.PUNCTUATION, ';');
                    return { type: ASTType.CONTINUE_STMT, line: tok.line };
            }
        }

        if (this.isTypeKeyword() || (tok.type === TokenType.IDENTIFIER && this.classes.has(tok.value))) {
            const savePos = this.pos;
            const vt = this.parseType();
            const nameTok = this.match(TokenType.IDENTIFIER);
            if (vt && nameTok) {
                let initVal = null;
                if (this.match(TokenType.OPERATOR, '=')) {
                    initVal = this.parseExpression();
                }
                this.match(TokenType.PUNCTUATION, ';');
                return { type: ASTType.VAR_DECL, varType: vt, name: nameTok.value, initVal, line: tok.line };
            }
            this.pos = savePos;
        }

        const expr = this.parseExpression();
        this.match(TokenType.PUNCTUATION, ';');
        return { type: ASTType.EXPR_STMT, expr, line: tok.line };
    }

    parseIfStmt() {
        const kw = this.advance();
        this.expect(TokenType.PUNCTUATION, '(');
        const condition = this.parseExpression();
        this.expect(TokenType.PUNCTUATION, ')');
        const thenBranch = this.parseStatement();
        let elseBranch = null;
        if (this.match(TokenType.KEYWORD, 'else')) {
            elseBranch = this.parseStatement();
        }
        return { type: ASTType.IF_STMT, condition, thenBranch, elseBranch, line: kw.line };
    }

    parseWhileStmt() {
        const kw = this.advance();
        this.expect(TokenType.PUNCTUATION, '(');
        const condition = this.parseExpression();
        this.expect(TokenType.PUNCTUATION, ')');
        const body = this.parseStatement();
        return { type: ASTType.WHILE_STMT, condition, body, line: kw.line };
    }

    parseForStmt() {
        const kw = this.advance();
        this.expect(TokenType.PUNCTUATION, '(');
        let init = null;
        if (!this.check(TokenType.PUNCTUATION, ';')) {
            if (this.isTypeKeyword()) {
                const vt = this.parseType();
                const nameTok = this.expect(TokenType.IDENTIFIER);
                let iv = null;
                if (this.match(TokenType.OPERATOR, '=')) iv = this.parseExpression();
                init = { type: ASTType.VAR_DECL, varType: vt, name: nameTok.value, initVal: iv, line: kw.line };
            } else {
                init = { type: ASTType.EXPR_STMT, expr: this.parseExpression(), line: kw.line };
            }
        }
        this.expect(TokenType.PUNCTUATION, ';');
        let condition = null;
        if (!this.check(TokenType.PUNCTUATION, ';')) {
            condition = this.parseExpression();
        }
        this.expect(TokenType.PUNCTUATION, ';');
        let update = null;
        if (!this.check(TokenType.PUNCTUATION, ')')) {
            update = this.parseExpression();
        }
        this.expect(TokenType.PUNCTUATION, ')');
        const body = this.parseStatement();
        return { type: ASTType.FOR_STMT, init, condition, update, body, line: kw.line };
    }

    parseReturnStmt() {
        const kw = this.advance();
        let value = null;
        if (!this.check(TokenType.PUNCTUATION, ';')) {
            value = this.parseExpression();
        }
        this.match(TokenType.PUNCTUATION, ';');
        return { type: ASTType.RETURN_STMT, value, line: kw.line };
    }

    // ============================================
    // Expression Parsing (Pratt parser)
    // ============================================
    parseExpression() {
        return this.parseAssignment();
    }

    parseAssignment() {
        const left = this.parseTernary();
        if (this.check(TokenType.OPERATOR, '=') || this.check(TokenType.OPERATOR, '+=') ||
            this.check(TokenType.OPERATOR, '-=') || this.check(TokenType.OPERATOR, '*=') ||
            this.check(TokenType.OPERATOR, '/=') || this.check(TokenType.OPERATOR, '%=')) {
            const op = this.advance();
            const right = this.parseAssignment();
            return { type: ASTType.ASSIGN_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseTernary() {
        const cond = this.parseLogicalOr();
        if (this.match(TokenType.OPERATOR, '?')) {
            const thenExpr = this.parseExpression();
            this.expect(TokenType.PUNCTUATION, ':');
            const elseExpr = this.parseAssignment();
            return { type: ASTType.BINARY_OP, op: '?:', left: cond, middle: thenExpr, right: elseExpr, line: cond.line };
        }
        return cond;
    }

    parseLogicalOr() {
        let left = this.parseLogicalAnd();
        while (this.check(TokenType.OPERATOR, '||')) {
            const op = this.advance();
            const right = this.parseLogicalAnd();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseLogicalAnd() {
        let left = this.parseEquality();
        while (this.check(TokenType.OPERATOR, '&&')) {
            const op = this.advance();
            const right = this.parseEquality();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseEquality() {
        let left = this.parseRelational();
        while (this.check(TokenType.OPERATOR, '==') || this.check(TokenType.OPERATOR, '!=')) {
            const op = this.advance();
            const right = this.parseRelational();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseRelational() {
        let left = this.parseBitwiseOr();
        while (this.check(TokenType.OPERATOR, '<') || this.check(TokenType.OPERATOR, '>') ||
               this.check(TokenType.OPERATOR, '<=') || this.check(TokenType.OPERATOR, '>=')) {
            const op = this.advance();
            const right = this.parseBitwiseOr();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseBitwiseOr() {
        let left = this.parseBitwiseXor();
        while (this.check(TokenType.OPERATOR, '|') && !this.check(TokenType.OPERATOR, '||')) {
            const op = this.advance();
            const right = this.parseBitwiseXor();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseBitwiseXor() {
        let left = this.parseBitwiseAnd();
        while (this.check(TokenType.OPERATOR, '^')) {
            const op = this.advance();
            const right = this.parseBitwiseAnd();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseBitwiseAnd() {
        let left = this.parseShift();
        while (this.check(TokenType.OPERATOR, '&') && !this.check(TokenType.OPERATOR, '&&')) {
            const op = this.advance();
            const right = this.parseShift();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseShift() {
        let left = this.parseAdditive();
        while (this.check(TokenType.OPERATOR, '<<') || this.check(TokenType.OPERATOR, '>>')) {
            const op = this.advance();
            const right = this.parseAdditive();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseAdditive() {
        let left = this.parseMultiplicative();
        while (this.check(TokenType.OPERATOR, '+') || this.check(TokenType.OPERATOR, '-')) {
            const op = this.advance();
            const right = this.parseMultiplicative();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseMultiplicative() {
        let left = this.parseUnary();
        while (this.check(TokenType.OPERATOR, '*') || this.check(TokenType.OPERATOR, '/') || this.check(TokenType.OPERATOR, '%')) {
            const op = this.advance();
            const right = this.parseUnary();
            left = { type: ASTType.BINARY_OP, op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseUnary() {
        if (this.check(TokenType.OPERATOR, '!') || this.check(TokenType.OPERATOR, '-') ||
            this.check(TokenType.OPERATOR, '+') || this.check(TokenType.OPERATOR, '~') ||
            this.check(TokenType.OPERATOR, '++') || this.check(TokenType.OPERATOR, '--')) {
            const op = this.advance();
            const operand = this.parseUnary();
            return { type: ASTType.UNARY_OP, op: op.value, operand, isPrefix: true, line: op.line };
        }
        return this.parsePostfix();
    }

    parsePostfix() {
        let expr = this.parsePrimary();
        while (true) {
            if (this.check(TokenType.OPERATOR, '.')) {
                const op = this.advance();
                const member = this.expect(TokenType.IDENTIFIER);
                expr = { type: ASTType.MEMBER_ACCESS, object: expr, member: member.value, line: op.line };
            } else if (this.check(TokenType.OPERATOR, '->')) {
                const op = this.advance();
                const member = this.expect(TokenType.IDENTIFIER);
                expr = { type: ASTType.MEMBER_ACCESS, object: expr, member: member.value, isPointer: true, line: op.line };
            } else if (this.check(TokenType.PUNCTUATION, '(')) {
                this.advance();
                const args = [];
                while (!this.check(TokenType.PUNCTUATION, ')') && this.current().type !== TokenType.EOF) {
                    args.push(this.parseExpression());
                    if (!this.match(TokenType.OPERATOR, ',') && !this.match(TokenType.PUNCTUATION, ',')) break;
                }
                this.expect(TokenType.PUNCTUATION, ')');
                expr = { type: ASTType.CALL_EXPR, callee: expr, args, line: 0 };
            } else if (this.check(TokenType.OPERATOR, '++') || this.check(TokenType.OPERATOR, '--')) {
                const op = this.advance();
                expr = { type: ASTType.UNARY_OP, op: op.value, operand: expr, isPrefix: false, line: op.line };
            } else {
                break;
            }
        }
        return expr;
    }

    parsePrimary() {
        this.skipTrivia();
        const tok = this.current();

        if (this.match(TokenType.PUNCTUATION, '(')) {
            const expr = this.parseExpression();
            this.expect(TokenType.PUNCTUATION, ')');
            return expr;
        }

        if (tok.type === TokenType.NUMBER) {
            this.advance();
            return { type: ASTType.NUMBER_LITERAL, value: tok.numValue, raw: tok.value, isFloat: tok.isFloat, line: tok.line };
        }
        if (tok.type === TokenType.STRING) {
            this.advance();
            return { type: ASTType.STRING_LITERAL, value: tok.value, line: tok.line };
        }
        if (tok.type === TokenType.CHAR) {
            this.advance();
            return { type: ASTType.CHAR_LITERAL, value: tok.charCode, line: tok.line };
        }
        if (tok.type === TokenType.KEYWORD && (tok.value === 'true' || tok.value === 'false')) {
            this.advance();
            return { type: ASTType.BOOL_LITERAL, value: tok.value === 'true', line: tok.line };
        }
        if (tok.type === TokenType.IDENTIFIER) {
            this.advance();
            return { type: ASTType.IDENTIFIER, name: tok.value, line: tok.line };
        }
        if (tok.type === TokenType.KEYWORD && tok.value === 'sizeof') {
            this.advance();
            this.expect(TokenType.PUNCTUATION, '(');
            const expr = this.parseExpression();
            this.expect(TokenType.PUNCTUATION, ')');
            return { type: ASTType.NUMBER_LITERAL, value: 4, raw: 'sizeof', isFloat: false, line: tok.line, isSizeof: true };
        }

        throw new Error(`Unexpected token '${tok.value}' at line ${tok.line}`);
    }
}

// ============================================
// Compiler API
// ============================================
class Compiler {
    static compile(source) {
        const lexer = new Lexer(source);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        return { ast, classes: parser.classes, functions: parser.functions, errors: [] };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Lexer, Parser, Compiler, TokenType, ASTType, KEYWORDS };
}
