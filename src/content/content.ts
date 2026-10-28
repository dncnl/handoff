// All readable copy lives here so the 3D layer never owns text.
import type { PoseName } from '../scene/Hand';

export interface WorkKind {
  title: string;
  body: string;
}

export interface Skill {
  name: string;
  /** Simple Icons slug, as on the Portfolio; omitted where there's no glyph. */
  slug?: string;
}

export interface SkillGroup {
  name: string;
  items: Skill[];
}

export interface Certification {
  name: string;
  issuer: string;
  issued?: string;
  badge: string;
  href: string;
}

export interface ContactLink {
  label: string;
  href: string;
  display: string;
}

export interface SectionMeta {
  id: 'build' | 'skills' | 'certs' | 'github' | 'contact';
  index: string;
  title: string;
  pose: PoseName;
}

export interface Content {
  name: string;
  kicker: string;
  tagline: string;
  whatIBuild: { intro: string; kinds: WorkKind[]; howIWork: string };
  skills: SkillGroup[];
  certifications: Certification[];
  github: { username: string; url: string; publicRepos: number };
  contact: { line: string; links: ContactLink[] };
  sections: SectionMeta[];
}

export const content: Content = {
  name: 'Daniel Martin Canlapan',
  kicker: 'b.s. computer science · fourth year',
  tagline: 'I build software, from problem to shipped screen.',
  whatIBuild: {
    intro:
      'I build software across the stack: web applications, machine learning models, and the interfaces people actually use, backed by documentation that keeps it all legible.',
    kinds: [
      {
        title: 'Web applications',
        body: 'Responsive front ends and secure REST APIs, from database to deployed screen.',
      },
      {
        title: 'Machine learning',
        body: 'Preprocessing, feature engineering, training and evaluating predictive models.',
      },
      {
        title: 'Interfaces',
        body: "Desktop apps, mobile apps and UI prototypes designed in Figma before they're built.",
      },
      {
        title: 'Documentation',
        body: "System docs and architecture overviews so the next person doesn't have to guess.",
      },
    ],
    howIWork:
      'I get the plan right before I touch the interface or the API behind it, then write it down.',
  },
  skills: [
    {
      name: 'Full-stack web',
      items: [
        { name: 'Node.js', slug: 'nodedotjs' },
        { name: 'Express', slug: 'express' },
        { name: 'JavaScript', slug: 'javascript' },
        { name: 'PostgreSQL', slug: 'postgresql' },
        { name: 'Supabase', slug: 'supabase' },
      ],
    },
    {
      name: 'Machine learning & data',
      items: [
        { name: 'Python', slug: 'python' },
        { name: 'scikit-learn', slug: 'scikitlearn' },
        { name: 'pandas', slug: 'pandas' },
        { name: 'NumPy', slug: 'numpy' },
        { name: 'Seaborn' },
      ],
    },
    {
      name: 'Software & UI',
      items: [
        { name: 'Tkinter' },
        { name: 'CustomTkinter' },
        { name: 'Figma', slug: 'figma' },
        { name: 'Flutter', slug: 'flutter' },
      ],
    },
    {
      name: 'Languages',
      items: [
        { name: 'Python', slug: 'python' },
        { name: 'Java', slug: 'openjdk' },
        { name: 'JavaScript', slug: 'javascript' },
        { name: 'C#' },
        { name: 'C++', slug: 'cplusplus' },
        { name: 'Dart', slug: 'dart' },
      ],
    },
    {
      name: 'Tools',
      items: [
        { name: 'Git', slug: 'git' },
        { name: 'GitHub', slug: 'github' },
        { name: 'VS Code' },
        { name: 'Claude Code', slug: 'claude' },
      ],
    },
    {
      name: 'Technical documentation',
      items: [{ name: 'Architecture docs' }, { name: 'Literature review' }],
    },
  ],
  certifications: [
    {
      name: 'Introduction to Data Science',
      issuer: 'Cisco',
      badge: '/credentials/cisco-intro-to-data-science.png',
      href: 'https://www.credly.com/badges/95acc8ae-eb98-4e9d-9779-076f3c5820db/public_url',
    },
    {
      name: 'Introduction to Cybersecurity',
      issuer: 'Cisco',
      issued: '5/4/2026',
      badge: '/credentials/cisco-intro-to-cybersecurity.png',
      href: 'https://www.credly.com/badges/c81fc21d-45e7-48a7-818b-af6fe0832e6b/public_url',
    },
  ],
  // Hardcoded for Milestone 1; Milestone 2 replaces this with a build-time fetch.
  github: {
    username: 'dncnl',
    url: 'https://github.com/dncnl',
    publicRepos: 18,
  },
  contact: {
    line: 'Open to internships, project work and collaborations.',
    links: [
      {
        label: 'Email',
        href: 'mailto:danielcanlapan0402@gmail.com',
        display: 'danielcanlapan0402@gmail.com',
      },
      { label: 'GitHub', href: 'https://github.com/dncnl', display: 'github.com/dncnl' },
      // TODO(content): replace with the real profile URL.
      { label: 'LinkedIn', href: 'https://www.linkedin.com/', display: 'LinkedIn' },
    ],
  },
  sections: [
    { id: 'build', index: '01', title: 'What I build', pose: 'hold' },
    { id: 'skills', index: '02', title: 'Skills', pose: 'tap' },
    { id: 'certs', index: '03', title: 'Certifications', pose: 'pinch' },
    { id: 'github', index: '04', title: 'GitHub', pose: 'palmUp' },
    { id: 'contact', index: '05', title: 'Contact', pose: 'point' },
  ],
};
