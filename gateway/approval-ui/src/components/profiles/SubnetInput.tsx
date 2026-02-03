import { useState } from "react";

interface SubnetInputProps {
  value: string[];
  onChange: (subnets: string[]) => void;
  disabled?: boolean;
}

const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

export default function SubnetInput({
  value,
  onChange,
  disabled,
}: SubnetInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validateCIDR = (cidr: string): boolean => {
    if (!CIDR_REGEX.test(cidr)) return false;

    const [ip, prefix] = cidr.split("/");
    const prefixNum = parseInt(prefix, 10);
    if (prefixNum < 0 || prefixNum > 32) return false;

    const octets = ip.split(".").map(Number);
    return octets.every((o) => o >= 0 && o <= 255);
  };

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (!validateCIDR(trimmed)) {
      setError("Invalid CIDR format (e.g., 192.168.1.0/24)");
      return;
    }

    if (value.includes(trimmed)) {
      setError("Subnet already added");
      return;
    }

    onChange([...value, trimmed]);
    setInputValue("");
    setError(null);
  };

  const handleRemove = (subnet: string) => {
    onChange(value.filter((s) => s !== subnet));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="192.168.1.0/24"
          disabled={disabled}
          style={{
            flex: 1,
            padding: "0.5rem",
            border: `1px solid ${error ? "#dc2626" : "var(--border-color)"}`,
            borderRadius: "6px",
            fontSize: "0.875rem",
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || !inputValue.trim()}
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            backgroundColor: "white",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled || !inputValue.trim() ? 0.5 : 1,
          }}
        >
          Add
        </button>
      </div>

      {error && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "#dc2626",
            marginBottom: "0.5rem",
          }}
        >
          {error}
        </div>
      )}

      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {value.map((subnet) => (
            <span
              key={subnet}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.25rem 0.5rem",
                backgroundColor: "var(--background)",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontFamily: "monospace",
              }}
            >
              {subnet}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(subnet)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "16px",
                    height: "16px",
                    padding: 0,
                    border: "none",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                    fontSize: "1rem",
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
          }}
        >
          No subnets added. Add at least one target subnet.
        </div>
      )}
    </div>
  );
}
