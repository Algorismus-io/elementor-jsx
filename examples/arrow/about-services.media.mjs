// Media manifest for the Arrow About + Services exjsx pages. Sideloads live-site images onto :8915
// with page-prefixed slugs (exjsx-arw-about-<n> / exjsx-arw-services-<n>) so nothing hotlinks and slugs
// never collide with the parallel home/platform/industries builds.
const U = 'https://tryreachwise.space/wp-content/uploads/2026/07';
export default [
  { slot: 'arw-about-1',    src: `${U}/arw-1148820.jpg`, alt: 'Digital transformation' },
  { slot: 'arw-services-1', src: `${U}/arw-3182759.jpg`, alt: 'AI Strategy & Consulting' },
  { slot: 'arw-services-2', src: `${U}/arw-8386440.jpg`, alt: 'Artificial Intelligence Solutions' },
  { slot: 'arw-services-3', src: `${U}/arw-669615.jpg`,  alt: 'Data Science & Advanced Analytics' },
  { slot: 'arw-services-4', src: `${U}/arw-574071.jpg`,  alt: 'Software Development' },
  { slot: 'arw-services-5', src: `${U}/arw-1148820.jpg`, alt: 'Digital Transformation' },
];
