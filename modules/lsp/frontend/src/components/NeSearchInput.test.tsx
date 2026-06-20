import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeSearchInput } from "./NeSearchInput";

const NE_IDS = ["NE-Alpha", "NE-Beta", "NE-Gamma"];

afterEach(() => {
  cleanup();
});

describe("NeSearchInput", () => {
  it("renders the committed value", () => {
    render(
      <NeSearchInput
        id="ne-test-render"
        value="NE-Alpha"
        onChange={() => undefined}
        placeholder="Source NE"
        neIds={NE_IDS}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("NE-Alpha");
  });

  it("clears the store when the field is emptied", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NeSearchInput
        id="ne-test-clear"
        value="NE-Alpha"
        onChange={onChange}
        placeholder="Source NE"
        neIds={NE_IDS}
      />,
    );
    await user.clear(screen.getByRole("combobox"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("commits a case-insensitive match on Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NeSearchInput
        id="ne-test-enter"
        value="NE-Alpha"
        onChange={onChange}
        placeholder="Source NE"
        neIds={NE_IDS}
      />,
    );
    const input = screen.getByRole("combobox");
    await user.clear(input);
    await user.type(input, "ne-beta{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("NE-Beta");
  });

  it("shows all NEs when opened with a committed value", async () => {
    const user = userEvent.setup();
    render(
      <NeSearchInput
        id="ne-test-open-all"
        value="NE-Alpha"
        onChange={() => undefined}
        placeholder="Source NE"
        neIds={NE_IDS}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("button", { name: "NE-Gamma" })).toBeInTheDocument();
  });

  it("reopens the full list when clicking an already-focused field", async () => {
    const user = userEvent.setup();
    render(
      <NeSearchInput
        id="ne-test-refocus"
        value="NE-Alpha"
        onChange={() => undefined}
        placeholder="Source NE"
        neIds={NE_IDS}
      />,
    );
    const input = screen.getByRole("combobox");
    await user.click(input);
    expect(screen.getByRole("button", { name: "NE-Gamma" })).toBeInTheDocument();
    await user.click(document.body);
    await user.click(input);
    expect(screen.getByRole("button", { name: "NE-Beta" })).toBeInTheDocument();
  });

  it("selects a different NE from the dropdown without clearing first", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NeSearchInput
        id="ne-test-pick"
        value="NE-Alpha"
        onChange={onChange}
        placeholder="Source NE"
        neIds={NE_IDS}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("button", { name: "NE-Gamma" }));
    expect(onChange).toHaveBeenCalledWith("NE-Gamma");
  });

  it("opens the full list via the chevron button", async () => {
    const user = userEvent.setup();
    render(
      <NeSearchInput
        id="ne-test-chevron"
        value="NE-Alpha"
        onChange={() => undefined}
        placeholder="Source NE"
        neIds={NE_IDS}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show Source NE options" }));
    expect(screen.getByRole("button", { name: "NE-Gamma" })).toBeInTheDocument();
  });

  it("selects highlighted option with ArrowDown and Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NeSearchInput
        id="ne-test-keys"
        value="NE-Alpha"
        onChange={onChange}
        placeholder="Source NE"
        neIds={NE_IDS}
      />,
    );
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("NE-Beta");
  });
});
