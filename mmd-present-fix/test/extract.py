#!/usr/bin/env python3
"""Print the named top-level definitions (functions, structs) of a C file, unchanged,
so that the tests build the very code of the patch."""
import re, sys

def extract(text, name):
    for m in re.finditer(r'^(static [^\n;]*\b%s\b\s*\(|struct %s\s*$)' % (name, name), text, re.M):
        start = m.start()
        i = text.index('{', start)
        depth = 0
        while True:
            c = text[i]
            if c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if not depth: break
            i += 1
        end = i + 1
        if text[end:end + 1] == ';': end += 1
        return text[start:end] + '\n'
    sys.exit('%s not found' % name)

src = open(sys.argv[1]).read()
for name in sys.argv[2:]:
    sys.stdout.write(extract(src, name) + '\n')
