import Select, { SingleValue, StylesConfig } from "react-select";
import { SymbolOption } from "./SymbolOption";

type SelectOption = {
  value: string;
  label: string;
  data: SymbolOption;
};

type SymbolSelectProps = {
  label: string;
  value: SymbolOption | null;
  options: SymbolOption[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (option: SymbolOption | null) => void;
  onClear: () => void;
};

const toSelectOption = (opt: SymbolOption): SelectOption => ({
  value: `${opt.file_path}:${opt.symbol}`,
  label: opt.symbol,
  data: opt,
});

const formatOptionLabel = (option: SelectOption) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontWeight: 600 }}>{option.data.symbol}</span>
      <span style={{ fontSize: "0.75rem", color: "#888" }}>
        {option.data.type}
      </span>
    </div>
    <span
      style={{ fontSize: "0.75rem", color: "#666", fontFamily: "monospace" }}
    >
      {option.data.file_path}
    </span>
  </div>
);

const darkThemeStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "#2a2a2a",
    borderColor: state.isFocused ? "#646cff" : "#444",
    boxShadow: state.isFocused ? "0 0 0 1px #646cff" : "none",
    "&:hover": {
      borderColor: "#646cff",
    },
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "#2a2a2a",
    border: "1px solid #444",
  }),
  menuList: (base) => ({
    ...base,
    backgroundColor: "#2a2a2a",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#3a3a3a" : "transparent",
    color: "#fff",
    padding: "8px 12px",
    cursor: "pointer",
    "&:active": {
      backgroundColor: "#444",
    },
  }),
  singleValue: (base) => ({
    ...base,
    color: "#fff",
  }),
  input: (base) => ({
    ...base,
    color: "#fff",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#888",
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: "#444",
  }),
  dropdownIndicator: (base) => ({
    ...base,
    color: "#888",
    "&:hover": {
      color: "#fff",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "#888",
    "&:hover": {
      color: "#fff",
    },
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: "#888",
  }),
};

export const SymbolSelect = ({
  label,
  value,
  options,
  searchQuery,
  onSearchChange,
  onSelect,
}: SymbolSelectProps) => {
  const selectOptions = options.map(toSelectOption);
  const selectedValue = value ? toSelectOption(value) : null;

  const handleChange = (newValue: SingleValue<SelectOption>) => {
    if (newValue) {
      onSelect(newValue.data);
    } else {
      onSelect(null);
    }
  };

  const handleInputChange = (inputValue: string) => {
    onSearchChange(inputValue);
  };

  return (
    <div style={{ flex: 1, minWidth: "200px" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.875rem",
          color: "#888",
          fontWeight: 500,
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </label>
      <Select<SelectOption>
        value={selectedValue}
        options={selectOptions}
        onChange={handleChange}
        onInputChange={handleInputChange}
        inputValue={searchQuery}
        placeholder="Search symbols..."
        isClearable
        formatOptionLabel={formatOptionLabel}
        styles={darkThemeStyles}
        noOptionsMessage={({ inputValue }) =>
          inputValue.length < 2
            ? "Type at least 2 characters..."
            : "No symbols found"
        }
      />
    </div>
  );
};
