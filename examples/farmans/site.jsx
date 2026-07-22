import { defineSite } from '../../src/site.mjs';
import { HomeView } from '../_shared/home.view.jsx';
import { farmans } from './theme.mjs';
export default defineSite({ name: 'farmans', theme: farmans, pages: [{ title: 'farmans (exjsx)', slug: 'farmans-exjsx', node: <HomeView theme={farmans} /> }] });
