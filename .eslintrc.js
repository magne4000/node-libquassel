module.exports = {
    "parser": "babel-eslint",
    "env": {
        "browser": true,
        "es6": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "sourceType": "module"
    },
    "rules": {
        "strict": "off",

        "indent": ["warn", 2],
        "quotes": ["warn", "single", { "allowTemplateLiterals": true }],
        "semi": ["warn", "always"],
        "eqeqeq": ["warn", "always"],
        "no-else-return": "warn",
        "block-spacing": ["warn", "always"],
        "brace-style": ["warn", "1tbs"],
        "object-curly-spacing": ["warn", "always"],
        "array-bracket-spacing": ["warn", "always", { "objectsInArrays": false, "arraysInArrays": false }],
        "comma-spacing": ["warn", { "after": true, "before": false }],
        "comma-style": ["warn", "last"],
        "computed-property-spacing": ["warn", "never"],
        "func-call-spacing": ["warn", "never"],
        "key-spacing": ["warn", {
            "beforeColon": false,
            "afterColon": true,
            "mode": "strict"
        }],
        "keyword-spacing": ["warn", { "after": true, "before": true }],
        "no-trailing-spaces": "warn",
        "padded-blocks": ["warn", "never"],
        "semi-spacing": "warn",
        "space-unary-ops": ["warn", { "words": true, "nonwords": false }],
        "prefer-destructuring": "warn",

        "linebreak-style": ["error", "unix"],
        "default-case": "error",
        "no-eval": "error",
        "no-throw-literal": "error",
        "no-with": "error",
        "radix": "error",
        "no-whitespace-before-property": "error",
        "no-unneeded-ternary": "error",
        "no-unused-vars": ["error", {
            "varsIgnorePattern": "^_",
            "argsIgnorePattern": "^_",
        }],
        "no-duplicate-imports": "error",
        "no-useless-computed-key": "error",
        "no-var": "error",
        "no-constant-condition": ["error", { "checkLoops": false }]
    }
};