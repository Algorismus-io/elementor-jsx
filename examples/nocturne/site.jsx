import { defineSite } from '../../src/site.mjs';
import { HomeView } from '../_shared/home.view.jsx';
import { nocturne } from './theme.mjs';
export default defineSite({ name: 'nocturne', theme: nocturne, pages: [{ title: 'nocturne (exjsx)', slug: 'nocturne-exjsx', node: <HomeView theme={nocturne} /> }] });
