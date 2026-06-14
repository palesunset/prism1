import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { MerlinWizardIcon } from './MerlinWizardIcon';

export function OzMessageBubble({
  role,
  content,
}: {
  role: 'user' | 'assistant' | 'system';
  content: string;
}) {
  if (role === 'system') {
    return (
      <div className="my-2 text-center text-sm italic" style={{ color: 'var(--color-muted)' }}>
        {content}
      </div>
    );
  }

  const isUser = role === 'user';

  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{
          background: isUser
            ? 'var(--red)'
            : 'linear-gradient(145deg, var(--border), var(--panel))',
          color: isUser ? '#fff' : 'var(--fg)',
          boxShadow: isUser ? undefined : '0 0 0 1px var(--border)',
        }}
        >
          {isUser ? <User className="h-4 w-4" /> : <MerlinWizardIcon size={28} />}
        </div>
        <div
          className={`px-4 py-2 ${isUser ? 'rounded-[18px_18px_0_18px]' : 'rounded-[18px_18px_18px_0]'}`}
          style={{
            background: isUser
              ? 'color-mix(in srgb, var(--red) 85%, var(--panel))'
              : 'color-mix(in srgb, var(--panel) 90%, var(--bg))',
            color: isUser ? '#fff' : 'var(--fg)',
            border: `1px solid ${isUser ? 'transparent' : 'var(--border)'}`,
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith('/')) {
                  return (
                    <Link
                      to={href}
                      className="font-medium underline hover:no-underline"
                      style={{ color: isUser ? '#fff' : 'var(--red)' }}
                    >
                      {children}
                    </Link>
                  );
                }
                return (
                  <a
                    href={href}
                    className="font-medium underline hover:no-underline"
                    style={{ color: 'var(--red)' }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                );
              },
              table: ({ children }) => (
                <div className="my-2 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th
                  className="border px-2 py-1 font-semibold"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
                >
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
                  {children}
                </td>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
