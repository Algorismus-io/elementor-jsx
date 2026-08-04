/** shared section component — lives OUTSIDE pages/ (content files only there). */
export const Band = ({ title, children }) => (
  <section tw="flex flex-col items-center gap-4 py-16">
    <h2 size={32}>{title}</h2>
    {children}
  </section>
);
