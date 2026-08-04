export const meta = { title: 'FS Demo Header' };
export default ({ theme: t }) => (
  <box tw="flex flex-row items-center justify-between w-full px-8 py-4" bg={t.color.primary}>
    <text size={18} weight={700} color="#fff">fsdemo</text>
    <text size={14} color="#fff" href="#top">Menu</text>
  </box>
);
