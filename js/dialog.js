// Modal focus containment and restoration; the rest of the editor becomes inert.
export function modalDialog(dialog, background, opener = document.activeElement) {
  const wasInert = background?.inert;
  if (background) background.inert = true;
  const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), input, select, textarea, a[href], [tabindex="0"]')].filter((e) => e.offsetParent);
  const close = () => { dialog.remove(); if (background) background.inert = !!wasInert; if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const list = focusable(), i = list.indexOf(document.activeElement);
      if (event.shiftKey && i <= 0) { event.preventDefault(); list.at(-1)?.focus(); }
      else if (!event.shiftKey && i === list.length - 1) { event.preventDefault(); list[0]?.focus(); }
    }
  });
  document.body.append(dialog); focusable()[0]?.focus();
  return close;
}
