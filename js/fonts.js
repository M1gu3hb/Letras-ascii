const FONTS = ['800 48px Nunito', '900 48px Nunito', 'italic 900 48px "Playfair Display"', '400 48px Pacifico', '400 48px Anton', '700 48px Caveat', '900 48px Unbounded', '900 48px Cinzel', '400 14px "JetBrains Mono"', '700 14px "JetBrains Mono"'];
export const loadFonts = () => Promise.all(FONTS.map((f) => document.fonts.load(f, 'AaEeOoÁñ¿¡'))).catch(() => {});

