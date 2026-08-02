// global/regexPresets.ts
// Shared regex-preset data and a best-effort "reverse generator" that turns a
// pattern back into a plausible matching sample string, used by the Regex
// Presets modal to preview each preset without needing real book text.

export interface RegexPreset {
    label: string;
    pattern: string;
}

export const BUILTIN_REGEX_PRESETS: RegexPreset[] = [
    { label: "第…章", pattern: "第.+章" },
    { label: "Chapter N", pattern: "Chapter\\s+\\d+" },
    { label: "Volume·Chapter", pattern: "Volume.*?Chapter" },
    { label: "1. / 一、", pattern: "^\\s*(\\d+[\\.、]|[一二三四五六七八九十]+[\\.、])" },
];

const DOT_POOL = ["一", "二", "三", "章", "A", "x", "1"];
const WORD_POOL = ["A", "b", "3", "文", "_"];
const DIGIT_POOL = "0123456789".split("");
const SPACE_POOL = [" "];
const NONSPACE_POOL = ["x", "1", "文"];
const NONDIGIT_POOL = ["A", "文", "x"];
const NONWORD_POOL = ["#", " ", "-"];
const NEGATED_CLASS_POOL = ["x", "1", "A", "文", " "];
const MAX_REPS = 20;

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Minimal recursive-descent walker over a regex source string that produces
 * one plausible matching string instead of validating/matching. Not a full
 * regex engine -- unsupported constructs (backreferences, unicode property
 * escapes, etc.) just degrade to a literal-ish guess rather than throwing,
 * and the whole thing is wrapped by generateRegexSample()'s try/catch. */
class RegexSampleGenerator {
    private steps = 0;
    private readonly maxSteps = 500;

    constructor(private src: string, private i = 0) {}

    generate(): string {
        return this.parseAlternation("");
    }

    private peek(): string | undefined {
        return this.src[this.i];
    }

    private guard() {
        this.steps++;
        if (this.steps > this.maxSteps) throw new Error("pattern too complex to preview");
    }

    private expect(ch: string) {
        if (this.peek() === ch) this.i++;
    }

    private parseAlternation(stopChars: string): string {
        const branches: string[] = [this.parseConcat(stopChars)];
        while (this.peek() === "|") {
            this.i++;
            branches.push(this.parseConcat(stopChars));
        }
        return pick(branches);
    }

    private parseConcat(stopChars: string): string {
        let out = "";
        while (this.i < this.src.length && this.peek() !== "|" && !stopChars.includes(this.peek()!)) {
            this.guard();
            out += this.parseQuantified();
        }
        return out;
    }

    private parseQuantified(): string {
        const atom = this.parseAtom();
        const q = this.peek();
        let min = 1;
        let max = 1;
        if (q === "*") {
            this.i++;
            min = 0;
            max = 3;
            this.skipLazy();
        } else if (q === "+") {
            this.i++;
            min = 1;
            max = 3;
            this.skipLazy();
        } else if (q === "?") {
            this.i++;
            min = 0;
            max = 1;
            this.skipLazy();
        } else if (q === "{") {
            const m = /^\{(\d+)(,(\d*))?\}/.exec(this.src.slice(this.i));
            if (m) {
                this.i += m[0].length;
                min = parseInt(m[1], 10);
                max = m[3] !== undefined ? (m[3] === "" ? min + 2 : parseInt(m[3], 10)) : min;
                this.skipLazy();
            }
        }
        const span = Math.max(0, Math.min(max, min + 3) - min);
        const reps = Math.min(min + (span > 0 ? Math.floor(Math.random() * (span + 1)) : 0), MAX_REPS);
        let out = "";
        for (let k = 0; k < reps; k++) out += atom;
        return out;
    }

    /** Non-greedy quantifiers (*?, +?, ??) are just a trailing '?' after the quantifier -- consume it. */
    private skipLazy() {
        if (this.peek() === "?") this.i++;
    }

    private parseAtom(): string {
        this.guard();
        const c = this.peek();
        if (c === "(") return this.parseGroup();
        if (c === "[") return this.parseClass();
        if (c === "\\") return this.parseEscape();
        if (c === ".") {
            this.i++;
            return pick(DOT_POOL);
        }
        if (c === "^" || c === "$") {
            this.i++;
            return "";
        }
        this.i++;
        return c ?? "";
    }

    private parseGroup(): string {
        this.i++; // consume '('
        if (this.peek() === "?") {
            const marker = this.src.slice(this.i, this.i + 3);
            if (marker.startsWith("?:")) {
                this.i += 2;
                const inner = this.parseAlternation(")");
                this.expect(")");
                return inner;
            }
            if (marker.startsWith("?=") || marker.startsWith("?!") || marker === "?<=" || marker === "?<!") {
                // Lookaround: zero-width, consume and discard.
                this.i += marker === "?<=" || marker === "?<!" ? 3 : 2;
                this.parseAlternation(")");
                this.expect(")");
                return "";
            }
            if (this.src[this.i + 1] === "<") {
                // Named capturing group (?<name>...)
                const close = this.src.indexOf(">", this.i);
                if (close !== -1) this.i = close + 1;
                const inner = this.parseAlternation(")");
                this.expect(")");
                return inner;
            }
        }
        const inner = this.parseAlternation(")");
        this.expect(")");
        return inner;
    }

    private parseClass(): string {
        this.i++; // consume '['
        let negate = false;
        if (this.peek() === "^") {
            negate = true;
            this.i++;
        }
        const chars: string[] = [];
        while (this.i < this.src.length && this.peek() !== "]") {
            this.guard();
            const ch = this.src[this.i];
            if (ch === "\\") {
                this.i++;
                chars.push(...this.escapeCharsFor(this.src[this.i]));
                this.i++;
                continue;
            }
            if (this.src[this.i + 1] === "-" && this.src[this.i + 2] && this.src[this.i + 2] !== "]") {
                const start = ch.codePointAt(0)!;
                const end = this.src[this.i + 2].codePointAt(0)!;
                const span = Math.max(0, Math.min(end - start, 200));
                for (let k = 0; k <= span; k++) chars.push(String.fromCodePoint(start + k));
                this.i += 3;
                continue;
            }
            chars.push(ch);
            this.i++;
        }
        this.expect("]");
        if (negate) {
            const safe = NEGATED_CLASS_POOL.filter((cand) => !chars.includes(cand));
            return pick(safe.length ? safe : NEGATED_CLASS_POOL);
        }
        return chars.length ? pick(chars) : "";
    }

    private parseEscape(): string {
        this.i++; // consume backslash
        const esc = this.src[this.i];
        this.i++;
        if (esc === "b" || esc === "B") return "";
        return pick(this.escapeCharsFor(esc));
    }

    private escapeCharsFor(esc: string): string[] {
        switch (esc) {
            case "d":
                return DIGIT_POOL;
            case "D":
                return NONDIGIT_POOL;
            case "w":
                return WORD_POOL;
            case "W":
                return NONWORD_POOL;
            case "s":
                return SPACE_POOL;
            case "S":
                return NONSPACE_POOL;
            case "n":
                return ["\n"];
            case "t":
                return ["\t"];
            default:
                return [esc ?? ""];
        }
    }
}

/** Best-effort: turns a regex pattern into a plausible sample it would match,
 * for preview purposes only. Returns null if the pattern is invalid or a
 * sample couldn't be produced (never throws). */
export function generateRegexSample(pattern: string): string | null {
    if (!pattern.trim()) return null;
    try {
        new RegExp(pattern);
    } catch {
        return null;
    }
    try {
        const sample = new RegexSampleGenerator(pattern).generate();
        const trimmed = sample.slice(0, 200);
        return trimmed.trim() ? trimmed : null;
    } catch {
        return null;
    }
}
