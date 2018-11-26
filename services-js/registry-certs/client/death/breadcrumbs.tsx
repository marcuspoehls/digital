import { breadcrumbNav } from '../PageLayout';

export const breadcrumbNavLinks: breadcrumbNav = {
  parentLinks: [
    {
      url: 'https://www.boston.gov/departments',
      text: 'Departments',
    },
    {
      url: 'https://www.boston.gov/departments/registry',
      text: 'Registry: Birth, death, and marriage',
    },
  ],
  currentPage: {
    url: '/death',
    text: 'Death certificates',
  },
};
