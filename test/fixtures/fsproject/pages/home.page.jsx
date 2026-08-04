import { Band } from '../components/Band.jsx';
export const meta = { title: 'Home', seo: { title: 'FS Demo — Home', description: 'fs-project fixture' } };
export default ({ theme: t }) => (
  <section tw="flex flex-col w-full items-center">
    {fontLoader('Poppins', [600, 700])}
    <h1 size={56} color={t.color.primary} font="Poppins">FS routing works</h1>
    <Band title="A band"><text size={18}>Body copy.</text></Band>
    {divider(sx({ w: 400, h: 1, bg: '#ddd' }))}
  </section>
);
