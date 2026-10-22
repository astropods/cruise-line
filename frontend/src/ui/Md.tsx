import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MdProps {
  children: string;
  components?: Components;
}

/**
 * Markdown, as written by the model. Images render as links: an <img> loads
 * on sight, so a prompt injection could make one carry data out in its URL.
 */
const SAFE_COMPONENTS: Components = {
  img: ({ src, alt }) => (
    <a href={typeof src === 'string' ? src : undefined} target="_blank" rel="noopener noreferrer nofollow">
      {alt || 'image'}
    </a>
  ),
};

export function Md({ children, components }: MdProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ ...SAFE_COMPONENTS, ...components }}>
      {children}
    </ReactMarkdown>
  );
}
