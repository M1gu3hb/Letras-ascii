import globals from 'globals';
export default [
 { files:['js/**/*.js'], languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.worker}},rules:{'no-undef':'error','no-unused-vars':['error',{args:'none',caughtErrors:'none'}]} },
 { files:['test/**/*.mjs','scripts/**/*.mjs','*.mjs'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.node,...globals.browser}},rules:{'no-undef':'error'} },
];
