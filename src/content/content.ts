// All readable copy lives here so the 3D layer never owns text.
import type { PoseName } from '../scene/Hand';

export interface WorkKind {
  title: string;
  body: string;
}

export interface SkillGroup {
  name: string;
  items: string[];
}

export interface Certification {
  name: string;
  issuer: string;
  issued?: string;
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
  github: { username: string; url: string; contributions: number; publicRepos: number };
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
      items: ['Node.js', 'Express', 'JavaScript', 'PostgreSQL', 'Supabase'],
    },
    {
      name: 'Machine learning & data',
      items: ['Python', 'scikit-learn', 'pandas', 'NumPy', 'Seaborn'],
    },
    { name: 'Software & UI', items: ['Tkinter', 'CustomTkinter', 'Figma', 'Flutter'] },
    { name: 'Technical documentation', items: ['Architecture docs', 'Literature review'] },
    { name: 'Languages', items: ['Python', 'Java', 'JavaScript', 'C#', 'C++', 'Dart'] },
  ],
  certifications: [
    { name: 'Introduction to Data Science', issuer: 'Cisco' },
    { name: 'Introduction to Cybersecurity', issuer: 'Cisco', issued: '5/4/2026' },
  ],
  // Hardcoded for Milestone 1; Milestone 2 replaces this with a build-time fetch.
  github: {
    username: 'dncnl',
    url: 'https://github.com/dncnl',
    contributions: 335,
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
