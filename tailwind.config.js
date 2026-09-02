/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /* Preflight escribe `html { font-family: theme(fontFamily.sans) }`, asi
         que este es EL punto unico donde la app entera toma la familia. Sin
         esto, la Inter recien cargada solo la verian los 40 inline que la
         nombran a mano. El valor es la variable, no la pila literal: la pila
         vive en src/tokens.css, que es la transcripcion de la skill. */
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
}
