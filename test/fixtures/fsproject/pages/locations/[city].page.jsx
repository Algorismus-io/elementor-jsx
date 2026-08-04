export const data = () => [
  { slug: 'locations-berlin', title: 'Berlin', seo: { title: 'Berlin office', description: 'b' }, props: { name: 'Berlin' } },
  { slug: 'locations-tokyo', title: 'Tokyo', seo: { title: 'Tokyo office', description: 't' }, props: { name: 'Tokyo' } },
];
export default ({ name }) => (
  <section tw="flex flex-col items-center py-24" cls="page-section">
    <h1 size={48} cls="page-title">Our {name} office</h1>
  </section>
);
