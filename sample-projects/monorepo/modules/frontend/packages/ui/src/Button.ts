/**
 * Button configuration options.
 */
export interface ButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Render a button as HTML string.
 * Simple component without cross-module dependencies.
 */
export function renderButton(props: ButtonProps): string {
  const disabledAttr = props.disabled ? ' disabled="true"' : "";
  return `<button${disabledAttr}>${props.label}</button>`;
}
