import CreatableSelect from "react-select/creatable";
import { SingleValue, StylesConfig } from "react-select";
import { GraphEndpoint, SymbolOption, symbolToEndpoint, queryToEndpoint } from "./SymbolOption";

type SelectOption = {
  value: string;
  label: string;
  isCustom?: boolean;
  data?: SymbolOption;
  __isNew__?: boolean;
};

type SymbolSelectProps = {
  label: string;
  value: GraphEndpoint | null;
  options: SymbolOption[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (endpoint: GraphEndpoint | null) => void;
  onClear: () => void;
};

const toSelectOption = (opt: SymbolOption): SelectOption => ({
  value: `${opt.file_path}:${opt.symbol}`,
  label: opt.symbol,
  data: opt,
});

const endpointToSelectOption = (endpoint: GraphEndpoint): SelectOption => {
  if (endpoint.kind === "symbol") {
    return {
      value: `${endpoint.file_path}:${endpoint.symbol}`,
      label: endpoint.symbol,
      data: endpoint,
    };
  }
  return {
    value: `query:${endpoint.query}`,
    label: endpoint.query,
    isCustom: true,
  };
};

const formatOptionLabel = (option: SelectOption) => {
  if (option.isCustom) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontWeight: 600 }}>{option.label}</span>
        <span style={{ fontSize: "0.75rem", color: "#888", fontStyle: "italic" }}>
          (text query)
        </span>
      </div>
    );
  }
  if (!option.data) {
    return <span>{option.label}</span>;
  }
  return (
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
};

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
  const selectedValue = value ? endpointToSelectOption(value) : null;

  const handleChange = (newValue: SingleValue<SelectOption>) => {
    if (!newValue) {
      onSelect(null);
      return;
    }
    // Handle existing query endpoints (isCustom) or symbol selection (data)
    if (newValue.isCustom) {
      onSelect(queryToEndpoint(newValue.label));
    } else if (newValue.data) {
      onSelect(symbolToEndpoint(newValue.data));
    }
    // Note: newly created options are handled by onCreateOption
  };

  const handleInputChange = (inputValue: string, actionMeta: { action: string }) => {
    // Only update search query for user input, not when clearing after selection
    if (actionMeta.action === "input-change") {
      onSearchChange(inputValue);
    }
  };

  const handleCreateOption = (inputValue: string) => {
    // Create a query endpoint from the typed text
    onSelect(queryToEndpoint(inputValue));
    onSearchChange(""); // Clear the search input
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
      <CreatableSelect<SelectOption>
        value={selectedValue}
        options={selectOptions}
        onChange={handleChange}
        onInputChange={handleInputChange}
        onCreateOption={handleCreateOption}
        inputValue={searchQuery}
        placeholder="Type to search or enter text query..."
        isClearable
        formatOptionLabel={formatOptionLabel}
        formatCreateLabel={(inputValue) => `Use "${inputValue}" as text query`}
        createOptionPosition="first"
        styles={darkThemeStyles}
        noOptionsMessage={({ inputValue }) =>
          inputValue.length < 2
            ? "Type at least 2 characters..."
            : "No symbols found - press Enter to use as text query"
        }
      />
    </div>
  );
};
