interface ProfileTypeBadgeProps {
  type: "preset" | "custom";
}

export default function ProfileTypeBadge({ type }: ProfileTypeBadgeProps) {
  const isPreset = type === "preset";

  return (
    <span
      style={{
        padding: "0.25rem 0.5rem",
        borderRadius: "4px",
        fontSize: "0.75rem",
        fontWeight: 500,
        backgroundColor: isPreset ? "#dbeafe" : "#f3e8ff",
        color: isPreset ? "#1e40af" : "#7c3aed",
      }}
    >
      {isPreset ? "Preset" : "Custom"}
    </span>
  );
}
