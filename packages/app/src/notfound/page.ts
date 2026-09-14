/**
 * 404。**一页只做一件事：告诉人这里没有东西，并且给他两条路。**
 *
 * 结构逐字取文档页的：横带（左边回到作品，右边字标）、一条重线、一行题、一句话，
 * 右上角挂目录。不画插图、不写俏皮话 —— 这件作品的站里没有第二种语气。
 */
import { COPY, setBi } from '../ui/i18n.ts';
import { heroMeta } from '../ui/hero.ts';
import { mountNav } from '../ui/nav.ts';
import { fromSearch } from '../ui/return-to.ts';
import '../ui/type.css';
import '../ui/editorial.css';

document.documentElement.style.cssText = 'overflow:auto;height:auto';
document.body.style.cssText = 'overflow:auto;height:auto';
document.body.classList.add('ed');

const page = document.createElement('main');
const head = document.createElement('header');
head.className = 'ed-hero';

const rule = document.createElement('hr');
rule.className = 'ed-rule ed-rule--heavy';

const titleBox = document.createElement('div');
titleBox.className = 'ed-hero__title';
const h1 = document.createElement('h1');
h1.className = 'sb-display';
setBi(h1, COPY.notFound.title);
titleBox.append(h1);

const lede = document.createElement('div');
lede.className = 'ed-hero__lede';
const p = document.createElement('p');
setBi(p, COPY.notFound.lede);
lede.append(p);

head.append(heroMeta('/', fromSearch(location.search)), rule, titleBox, lede);
page.append(head);
document.body.append(page);

mountNav();
