import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnswerText } from "./answer-text";

/**
 * The regression these tests exist for is visible on a public page: the live
 * assistant answered with `**TK Qur'an**` and the widget printed the asterisks.
 * The first case is that exact answer shape.
 *
 * The rest pin the boundary of the subset — what must be formatted, and what
 * must survive untouched. "Untouched" is the important half: this string comes
 * from a model, so every branch that does not recognise something has to leave
 * it as text rather than guess.
 */
describe("AnswerText", () => {
  it("renders bold instead of printing its asterisks", () => {
    const { container } = render(
      <AnswerText>
        {"Kami membuka **TK Qur'an** dan **SD Qur'an**."}
      </AnswerText>,
    );

    expect(container.textContent).not.toContain("**");
    expect(screen.getByText("TK Qur'an").tagName).toBe("STRONG");
    expect(screen.getByText("SD Qur'an").tagName).toBe("STRONG");
  });

  it("turns a numbered answer into an ordered list", () => {
    const { container } = render(
      <AnswerText>
        {"Langkah pendaftaran:\n1. Isi formulir\n2. Bayar biaya\n3. Tes"}
      </AnswerText>,
    );

    const list = container.querySelector("ol");
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll("li")).toHaveLength(3);
    expect(container.textContent).not.toContain("1.");
  });

  it("turns dashes and bullets into an unordered list", () => {
    const { container } = render(
      <AnswerText>{"Unit:\n- TK Qur'an\n- SD Qur'an\n• SMP"}</AnswerText>,
    );

    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelectorAll("li")).toHaveLength(3);
  });

  it("keeps an ordered and an unordered run as separate lists", () => {
    const { container } = render(
      <AnswerText>{"1. Satu\n2. Dua\n- Tiga"}</AnswerText>,
    );

    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
  });

  it("links only to schemes we allow", () => {
    render(
      <AnswerText>
        {
          "Lihat [halaman SPMB](https://cipansor.or.id/admissions) untuk detail."
        }
      </AnswerText>,
    );

    const link = screen.getByRole("link", { name: "halaman SPMB" });
    expect(link).toHaveAttribute("href", "https://cipansor.or.id/admissions");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("refuses to make a javascript: target clickable", () => {
    const { container } = render(
      <AnswerText>{"[klik](javascript:alert(1))"}</AnswerText>,
    );

    expect(container.querySelector("a")).toBeNull();
    // Left visible as written, so nothing is silently swallowed.
    expect(container.textContent).toContain("javascript:alert(1)");
  });

  it("never emits markup that was not one of its own elements", () => {
    const { container } = render(
      <AnswerText>{"<img src=x onerror=alert(1)> **tebal**"}</AnswerText>,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("leaves an unmatched asterisk alone", () => {
    const { container } = render(
      <AnswerText>{"Biaya 2 * 500.000 rupiah"}</AnswerText>,
    );

    expect(container.textContent).toBe("Biaya 2 * 500.000 rupiah");
    expect(container.querySelector("em")).toBeNull();
  });

  it("keeps blank-line separated prose as separate paragraphs", () => {
    const { container } = render(
      <AnswerText>{"Assalamu'alaikum.\n\nAda yang bisa dibantu?"}</AnswerText>,
    );

    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("renders a heading line as emphasised text, without the hashes", () => {
    const { container } = render(
      <AnswerText>{"### Biaya\nRp 500.000"}</AnswerText>,
    );

    expect(container.textContent).not.toContain("#");
    expect(container.querySelector("p")?.className).toContain("font-semibold");
  });
});
