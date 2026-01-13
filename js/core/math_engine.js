// core/math_engine.js
// Parser: shunting-yard. Supports + - * / ^ (), unary -, factorial !, constants pi,e, functions.
const FUNCTIONS = new Set(['sin','cos','tan','asin','acos','atan','ln','log','sqrt','abs','exp']);
const CONSTANTS = { pi: Math.PI, e: Math.E };

const PREC = { 'u-':5, '^':4, '*':3, '/':3, '+':2, '-':2 };
const RIGHT_ASSOC = new Set(['^','u-']);

export function createMathEngine(getDeg){
  function tokenize(input){
    const s = String(input ?? '').replace(/\s+/g,'').toLowerCase();
    const tokens = [];
    let i=0;
    while(i<s.length){
      const ch = s[i];

      if (/[0-9.]/.test(ch)){
        let j=i;
        while(j<s.length && /[0-9.]/.test(s[j])) j++;
        const numStr = s.slice(i,j);
        if (numStr.split('.').length>2) throw new Error('Format angka tidak valid');
        tokens.push({type:'num', value: parseFloat(numStr)});
        i=j; continue;
      }

      if (/[a-z]/.test(ch)){
        let j=i;
        while(j<s.length && /[a-z]/.test(s[j])) j++;
        const id = s.slice(i,j);
        if (FUNCTIONS.has(id)) tokens.push({type:'fn', value:id});
        else if (id in CONSTANTS) tokens.push({type:'num', value: CONSTANTS[id]});
        else throw new Error('Identifier tidak dikenal: ' + id);
        i=j; continue;
      }

      if ('+-*/^()!'.includes(ch)){
        if (ch==='(' || ch===')') tokens.push({type:'par', value: ch});
        else if (ch==='!') tokens.push({type:'fact', value:'!'});
        else tokens.push({type:'op', value: ch});
        i++; continue;
      }

      throw new Error('Karakter tidak valid: ' + ch);
    }
    return tokens;
  }

  function toRPN(tokens){
    const out = [];
    const stack = [];
    let prevType = 'start';

    for (const t of tokens){
      if (t.type==='num'){
        out.push(t); prevType='num'; continue;
      }
      if (t.type==='fn'){
        stack.push(t); prevType='fn'; continue;
      }
      if (t.type==='fact'){
        out.push(t); prevType='fact'; continue;
      }
      if (t.type==='par' && t.value==='('){
        stack.push(t); prevType='par('; continue;
      }
      if (t.type==='par' && t.value===')'){
        while(stack.length && !(stack[stack.length-1].type==='par' && stack[stack.length-1].value==='(')){
          out.push(stack.pop());
        }
        if (!stack.length) throw new Error('Kurung tidak seimbang');
        stack.pop();
        if (stack.length && stack[stack.length-1].type==='fn') out.push(stack.pop());
        prevType='par)'; continue;
      }
      if (t.type==='op'){
        let op = t.value;
        if (op==='-' && (prevType==='start' || prevType==='op' || prevType==='par(' || prevType==='fn')){
          op = 'u-';
        }
        while(stack.length){
          const top = stack[stack.length-1];
          if (top.type==='fn'){ out.push(stack.pop()); continue; }
          if (top.type==='op'){
            const p1 = PREC[op], p2 = PREC[top.value];
            if (p2 > p1 || (p2 === p1 && !RIGHT_ASSOC.has(op))){
              out.push(stack.pop()); continue;
            }
          }
          if (top.type==='par' && top.value==='(') break;
          break;
        }
        stack.push({type:'op', value: op});
        prevType='op';
        continue;
      }
      throw new Error('Token tidak didukung');
    }

    while(stack.length){
      const top = stack.pop();
      if (top.type==='par') throw new Error('Kurung tidak seimbang');
      out.push(top);
    }
    return out;
  }

  function factorial(n){
    if (!isFinite(n)) return NaN;
    if (n < 0) return NaN;
    if (Math.floor(n) !== n) return NaN;
    if (n > 170) return Infinity;
    let r = 1;
    for (let i=2;i<=n;i++) r *= i;
    return r;
  }

  function applyFn(name, x){
    const deg = !!getDeg?.();
    const rad = deg ? (x * Math.PI / 180) : x;
    switch(name){
      case 'sin': return Math.sin(rad);
      case 'cos': return Math.cos(rad);
      case 'tan': return Math.tan(rad);
      case 'asin': return deg ? (Math.asin(x) * 180 / Math.PI) : Math.asin(x);
      case 'acos': return deg ? (Math.acos(x) * 180 / Math.PI) : Math.acos(x);
      case 'atan': return deg ? (Math.atan(x) * 180 / Math.PI) : Math.atan(x);
      case 'ln': return Math.log(x);
      case 'log': return Math.log10(x);
      case 'sqrt': return Math.sqrt(x);
      case 'abs': return Math.abs(x);
      case 'exp': return Math.exp(x);
      default: throw new Error('Function tidak dikenal: ' + name);
    }
  }

  function evalRPN(rpn){
    const st = [];
    for (const t of rpn){
      if (t.type==='num'){
        st.push(t.value);
      } else if (t.type==='op'){
        if (t.value === 'u-'){
          if (st.length<1) throw new Error('Ekspresi tidak valid');
          st.push(-st.pop());
        } else {
          if (st.length<2) throw new Error('Ekspresi tidak valid');
          const b = st.pop();
          const a = st.pop();
          switch(t.value){
            case '+': st.push(a+b); break;
            case '-': st.push(a-b); break;
            case '*': st.push(a*b); break;
            case '/': st.push(a/b); break;
            case '^': st.push(Math.pow(a,b)); break;
            default: throw new Error('Operator tidak dikenal');
          }
        }
      } else if (t.type==='fn'){
        if (st.length<1) throw new Error('Ekspresi tidak valid');
        st.push(applyFn(t.value, st.pop()));
      } else if (t.type==='fact'){
        if (st.length<1) throw new Error('Ekspresi tidak valid');
        st.push(factorial(st.pop()));
      } else {
        throw new Error('RPN token tidak didukung');
      }
    }
    if (st.length !== 1) throw new Error('Ekspresi tidak valid');
    return st[0];
  }

  function evaluate(expression){
    const tokens = tokenize(expression);
    const rpn = toRPN(tokens);
    return evalRPN(rpn);
  }

  return { evaluate };
}
