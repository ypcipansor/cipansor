import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/**
 * What the trigger reads when nothing, or "All", is chosen. The wrapper maps
 * an item's "" to a sentinel (Radix forbids it); it used to map the Root's ""
 * too, so a Select with no "All" item showed an empty box instead of its
 * placeholder, and call sites passed `undefined` instead — which turns the
 * Select uncontrolled and keeps a cleared choice on screen.
 */
function Picker(props: {
  value?: string;
  defaultValue?: string;
  withAll?: boolean;
}) {
  return (
    <Select
      value={props.value}
      defaultValue={props.defaultValue}
      onValueChange={() => {}}
    >
      <SelectTrigger aria-label="Guru">
        <SelectValue placeholder="Pilih guru" />
      </SelectTrigger>
      <SelectContent>
        {props.withAll && <SelectItem value="">Semua guru</SelectItem>}
        <SelectItem value="a">Ustadz Ahmad</SelectItem>
      </SelectContent>
    </Select>
  );
}

const trigger = () => screen.getByRole("combobox", { name: "Guru" });

describe("Select — the empty value", () => {
  it('"" with no "All" item shows the placeholder, not an empty box', () => {
    render(<Picker value="" />);
    expect(trigger()).toHaveTextContent("Pilih guru");
  });

  it('"" with an "All" item shows that item as chosen', () => {
    render(<Picker value="" withAll />);
    expect(trigger()).toHaveTextContent("Semua guru");
  });

  it('a choice cleared back to "" shows the placeholder again', () => {
    const { rerender } = render(<Picker value="a" />);
    expect(trigger()).toHaveTextContent("Ustadz Ahmad");
    rerender(<Picker value="" />);
    expect(trigger()).toHaveTextContent("Pilih guru");
    expect(trigger()).not.toHaveTextContent("Ustadz Ahmad");
  });

  it('an uncontrolled "All" default still shows "All"', () => {
    render(<Picker defaultValue="" withAll />);
    expect(trigger()).toHaveTextContent("Semua guru");
  });
});
