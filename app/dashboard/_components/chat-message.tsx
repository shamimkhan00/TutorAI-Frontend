import type { Msg } from "../_types/dashboard";
import { markdownToHtml } from "../_lib/markdown";

export function AiAvatar() {
  return (
    <div
      className="chat-avatar"
      style={{
        width: 32,
        height: 32,
        flexShrink: 0,
        background: "var(--accent)",
        borderRadius: 9,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontSize: "0.85rem",
        color: "#0d0e14",
        fontWeight: 700,
      }}
    >
      T
    </div>
  );
}

export function ChatMessage({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";

  return (
    <div
      className="chat-message-row animate-fade-in"
      data-role={msg.role}
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 12,
        alignItems: "flex-end",
      }}
    >
      {!isUser && <AiAvatar />}
      <div className="chat-message-bubble-wrap">
        <div className={isUser ? "bubble-user" : "bubble-ai"}>
          {isUser ? (
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
          ) : (
            <div
              className="ai-prose"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }}
            />
          )}
          {msg.streaming && (
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: "1em",
                background: isUser ? "#0d0e14" : "var(--accent)",
                marginLeft: 3,
                verticalAlign: "text-bottom",
                animation: "typingBounce 0.9s infinite",
              }}
            />
          )}
        </div>
        {msg.citations && msg.citations.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {msg.citations.map((citation, index) => (
              <span key={index} className="citation-chip" title={citation.excerpt}>
                {citation.docName}
                {citation.page ? ` · p.${citation.page}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
