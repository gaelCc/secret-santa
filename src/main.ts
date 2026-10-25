import "./style.css";
import {
  ApiError, call, forgetToken, isConfigured, linkFor, readToken, switchToken,
  type AdminData, type AdminParticipant, type Person, type State, type WishlistItem,
} from "./api.ts";
import { confirmDialog, h, toast } from "./dom.ts";
import { errorMessage, formatDate, t } from "./strings.it.ts";

const root = document.getElementById("app")!;

let state: State | null = null;
let busy = false;
let editingItemId: string | null = null;
let editingPersonId: string | null = null;
/** Links shown once after creation/regeneration. Kept in memory only. */
const freshLinks = new Map<string, string>();
/** Persistent message in the admin draw card (e.g. "no repeat" rule relaxed). */
let drawNotice: string | null = null;

// ---------------------------------------------------------------------------
// Data flow

async function load() {
  state = await call<State>("state");
}

function showMessage(title: string, body: string) {
  root.replaceChildren(
    h("main", { class: "container" },
      h("section", { class: "card card-center" }, h("h1", {}, title), h("p", {}, body))),
  );
}

function handleError(err: unknown) {
  const code = err instanceof ApiError ? err.code : "server_error";
  if (code === "invalid_token") {
    forgetToken();
    state = null;
    showMessage(t.badLinkTitle, t.badLinkBody);
    return;
  }
  if (!(err instanceof ApiError)) console.error(err);
  toast(errorMessage(code), "error", 6000);
}

/** Runs an action, reloads state and re-renders. Returns false on failure. */
async function act(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  if (busy) return false;
  busy = true;
  document.body.classList.add("busy");
  try {
    await fn();
    await load();
    if (success) toast(success);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    busy = false;
    document.body.classList.remove("busy");
    if (state) render();
  }
}

function formValues(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((value, key) => (out[key] = String(value)));
  return out;
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  if (!state) return;
  root.replaceChildren(
    h("header", { class: "site-header" },
      h("p", { class: "eyebrow" }, "🎄 ", t.appTitle),
      h("h1", {}, t.hello(state.me.name))),
    h("main", { class: "container" },
      assignmentCard(state),
      myListSection(state),
      familySection(state),
      state.admin && adminSection(state, state.admin)),
  );
}

function assignmentCard(s: State) {
  if (s.assignment) {
    const { receiverId, receiverName } = s.assignment;
    return h("section", { class: "card card-assignment" },
      h("p", { class: "assignment-label" }, t.youBuyFor),
      h("p", { class: "assignment-name" }, receiverName, " 🎁"),
      h("button", {
        type: "button",
        class: "btn btn-light",
        onclick: () => document.getElementById(`person-${receiverId}`)?.scrollIntoView({ behavior: "smooth" }),
      }, t.seeTheirList));
  }
  const text = !s.event ? t.noEventYet : s.event.status === "open" ? t.noDrawYet(s.event.year) : t.drawnNoAssignment;
  return h("section", { class: "card card-waiting" }, h("p", {}, "⏳ ", text));
}

// --- Wishlist items ---------------------------------------------------------

function itemContent(item: WishlistItem) {
  return h("div", { class: "item-body" },
    item.url
      ? h("a", { class: "item-title", href: item.url, target: "_blank", rel: "noopener noreferrer" }, item.title, " ↗")
      : h("span", { class: "item-title" }, item.title),
    item.notes && h("p", { class: "item-notes" }, item.notes));
}

function itemForm(item: WishlistItem | null, onDone?: () => void) {
  const form = h("form", { class: "item-form" },
    h("label", { class: "field" },
      h("span", {}, t.itemTitle),
      h("input", {
        name: "title", required: true, maxlength: 200, value: item?.title ?? "",
        placeholder: t.itemTitlePlaceholder,
      })),
    h("label", { class: "field" },
      h("span", {}, t.itemUrl),
      h("input", {
        name: "url", type: "url", inputmode: "url", maxlength: 2000, value: item?.url ?? "",
        placeholder: t.itemUrlPlaceholder,
      })),
    h("label", { class: "field" },
      h("span", {}, t.itemNotes),
      h("textarea", { name: "notes", rows: 2, maxlength: 1000, placeholder: t.itemNotesPlaceholder },
        item?.notes ?? "")),
    h("div", { class: "row row-end" },
      item && h("button", { type: "button", class: "btn btn-ghost", onclick: onDone }, t.cancel),
      h("button", { type: "submit", class: "btn btn-primary" }, item ? t.save : t.addItem)));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = formValues(form);
    if (item) {
      if (await act(() => call("wishlist.update", { id: item.id, ...values }), t.itemSaved)) editingItemId = null;
      render();
    } else {
      await act(() => call("wishlist.add", values), t.itemAdded);
    }
  });
  return form;
}

function myListSection(s: State) {
  const items = s.people.find((p) => p.id === s.me.id)?.items ?? [];
  const ids = items.map((i) => i.id);
  const move = (index: number, delta: number) => {
    const order = ids.slice();
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    act(() => call("wishlist.reorder", { ids: order }));
  };

  return h("section", { class: "card" },
    h("h2", {}, t.myList),
    h("p", { class: "hint" }, t.myListHint),
    items.length === 0 && h("p", { class: "empty" }, t.myListEmpty),
    h("ul", { class: "items" },
      items.map((item, index) =>
        editingItemId === item.id
          ? h("li", { class: "item item-editing" }, itemForm(item, () => {
            editingItemId = null;
            render();
          }))
          : h("li", { class: "item" },
            itemContent(item),
            h("div", { class: "item-actions" },
              h("button", {
                type: "button", class: "btn-icon", title: t.moveUp, "aria-label": t.moveUp,
                disabled: index === 0, onclick: () => move(index, -1),
              }, "↑"),
              h("button", {
                type: "button", class: "btn-icon", title: t.moveDown, "aria-label": t.moveDown,
                disabled: index === items.length - 1, onclick: () => move(index, 1),
              }, "↓"),
              h("button", {
                type: "button", class: "btn btn-small btn-ghost",
                onclick: () => {
                  editingItemId = item.id;
                  render();
                },
              }, t.edit),
              h("button", {
                type: "button", class: "btn btn-small btn-ghost btn-danger-text",
                onclick: async () => {
                  const ok = await confirmDialog({
                    message: t.confirmDeleteItem(item.title), confirmLabel: t.yesDelete, danger: true,
                  });
                  if (ok) act(() => call("wishlist.delete", { id: item.id }), t.itemDeleted);
                },
              }, t.delete))))),
    h("div", { class: "add-item" }, itemForm(null)));
}

// --- Family lists -------------------------------------------------------------

function familySection(s: State) {
  const receiverId = s.assignment?.receiverId;
  const others: Person[] = s.people
    .filter((p) => p.id !== s.me.id)
    .sort((a, b) => Number(b.id === receiverId) - Number(a.id === receiverId));

  return h("section", { class: "family" },
    h("h2", { class: "section-title" }, t.familyLists),
    others.length === 0 && h("p", { class: "empty" }, t.nobodyElse),
    others.map((p) =>
      h("article", { class: p.id === receiverId ? "card person person-highlight" : "card person", id: `person-${p.id}` },
        p.id === receiverId && h("p", { class: "badge badge-gift" }, t.yourReceiverBadge),
        h("h3", {}, p.name),
        p.items.length === 0
          ? h("p", { class: "empty" }, t.emptyList)
          : h("ul", { class: "items" }, p.items.map((item) => h("li", { class: "item" }, itemContent(item)))))));
}

// --- Admin ----------------------------------------------------------------------

function adminSection(s: State, admin: AdminData) {
  return h("section", { class: "admin" },
    h("h2", { class: "section-title" }, "🛠️ ", t.adminTitle),
    h("p", { class: "hint" }, t.adminHint),
    drawCard(s, admin),
    participantsCard(s, admin),
    couplesCard(admin));
}

function waUrl(person: AdminParticipant, link: string) {
  const text = encodeURIComponent(t.waMessage(person.name, link));
  return person.phone ? `https://wa.me/${person.phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

async function copy(text: string, input: HTMLInputElement) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  toast(t.linkCopied);
}

async function regenerate(s: State, person: AdminParticipant) {
  const token = (await call<{ token: string }>("admin.participant.regenerate", { id: person.id })).token;
  if (person.id === s.me.id) switchToken(token);
  freshLinks.set(person.id, linkFor(token));
}

function freshLinkBox(person: AdminParticipant, link: string) {
  const input = h("input", { type: "text", readonly: true, value: link, class: "link-input", onfocus: (e: Event) => (e.target as HTMLInputElement).select() });
  return h("div", { class: "fresh-link" },
    h("p", { class: "fresh-link-title" }, t.freshLinkTitle(person.name)),
    h("div", { class: "row" },
      input,
      h("button", { type: "button", class: "btn btn-small btn-ghost", onclick: () => copy(link, input) }, t.copyLink)),
    h("a", { class: "btn btn-whatsapp", href: waUrl(person, link), target: "_blank", rel: "noopener noreferrer" },
      t.sendWhatsApp),
    h("p", { class: "warning" }, t.freshLinkWarning),
    h("button", {
      type: "button", class: "btn btn-small btn-ghost",
      onclick: () => {
        freshLinks.delete(person.id);
        render();
      },
    }, t.hideLink));
}

function personForm(person: AdminParticipant | null) {
  const form = h("form", { class: "person-form" },
    h("label", { class: "field" },
      h("span", {}, t.personName),
      h("input", { name: "name", required: true, maxlength: 60, value: person?.name ?? "", autocomplete: "off" })),
    h("label", { class: "field" },
      h("span", {}, t.personPhone),
      h("input", {
        name: "phone", type: "tel", inputmode: "tel", value: person?.phone ? `+${person.phone}` : "",
        placeholder: "+39 333 123 4567", autocomplete: "off",
      }),
      h("small", {}, t.personPhoneHint)),
    h("div", { class: "row row-end" },
      person && h("button", {
        type: "button", class: "btn btn-ghost",
        onclick: () => {
          editingPersonId = null;
          render();
        },
      }, t.cancel),
      h("button", { type: "submit", class: "btn btn-primary" }, person ? t.save : t.add)));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = formValues(form);
    if (person) {
      if (await act(() => call("admin.participant.update", { id: person.id, ...values }), t.personSaved)) {
        editingPersonId = null;
        render();
      }
    } else {
      await act(async () => {
        const res = await call<{ participant: { id: string }; token: string }>("admin.participant.create", values);
        freshLinks.set(res.participant.id, linkFor(res.token));
      }, t.personAdded(values.name.trim()));
    }
  });
  return form;
}

function participantsCard(s: State, admin: AdminData) {
  const drawn = s.event?.status === "drawn";
  return h("section", { class: "card" },
    h("h3", {}, t.participants),
    h("ul", { class: "people" },
      admin.participants.map((p) => {
        const link = freshLinks.get(p.id);
        if (editingPersonId === p.id) return h("li", { class: "person-row" }, personForm(p));
        return h("li", { class: p.active ? "person-row" : "person-row person-inactive" },
          h("div", { class: "person-info" },
            h("strong", {}, p.name),
            p.is_admin && h("span", { class: "badge" }, t.adminBadge),
            !p.active && h("span", { class: "badge badge-muted" }, t.inactiveBadge),
            p.phone && h("span", { class: "phone" }, `+${p.phone}`)),
          h("div", { class: "row row-wrap" },
            p.active && !link && h("button", {
              type: "button", class: "btn btn-small btn-whatsapp",
              onclick: async () => {
                const ok = await confirmDialog({ message: t.sendWhatsAppNeedsLink(p.name), confirmLabel: t.yesProceed });
                if (ok) act(() => regenerate(s, p));
              },
            }, t.sendWhatsApp),
            p.active && h("button", {
              type: "button", class: "btn btn-small btn-ghost",
              onclick: async () => {
                const ok = await confirmDialog({
                  message: p.id === s.me.id ? t.confirmRegenerateSelf : t.confirmRegenerate(p.name),
                  confirmLabel: t.yesProceed,
                });
                if (ok) act(() => regenerate(s, p));
              },
            }, t.newLink),
            h("button", {
              type: "button", class: "btn btn-small btn-ghost",
              onclick: () => {
                editingPersonId = p.id;
                render();
              },
            }, t.edit),
            !p.is_admin && (p.active
              ? h("button", {
                type: "button", class: "btn btn-small btn-ghost btn-danger-text",
                onclick: async () => {
                  const ok = await confirmDialog({ message: t.confirmDeactivate(p.name), confirmLabel: t.deactivate, danger: true });
                  if (ok) {
                    freshLinks.delete(p.id);
                    act(() => call("admin.participant.update", { id: p.id, active: false }), t.personSaved);
                  }
                },
              }, t.deactivate)
              : h("button", {
                type: "button", class: "btn btn-small btn-ghost",
                onclick: () => act(() => call("admin.participant.update", { id: p.id, active: true }), t.personSaved),
              }, t.reactivate))),
          link && p.active && freshLinkBox(p, link));
      })),
    h("h4", {}, t.addPerson),
    drawn && h("p", { class: "warning" }, t.lateJoinerWarning),
    personForm(null));
}

function couplesCard(admin: AdminData) {
  const nameOf = new Map(admin.participants.map((p) => [p.id, p.name]));
  const active = admin.participants.filter((p) => p.active);
  const select = (name: string) =>
    h("select", { name, required: true },
      h("option", { value: "" }, t.choosePerson),
      active.map((p) => h("option", { value: p.id }, p.name)));

  const form = h("form", { class: "couple-form" },
    h("div", { class: "row row-wrap" }, select("a"), h("span", { class: "heart" }, "❤️"), select("b")),
    h("button", { type: "submit", class: "btn btn-primary" }, t.addCouple));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const { a, b } = formValues(form);
    if (a === b) {
      toast(errorMessage("same_person"), "error");
      return;
    }
    act(() => call("admin.exclusion.add", { a, b }), t.coupleAdded);
  });

  return h("section", { class: "card" },
    h("h3", {}, t.couples),
    h("p", { class: "hint" }, t.couplesHint),
    admin.exclusions.length === 0 && h("p", { class: "empty" }, t.noCouples),
    h("ul", { class: "couples" },
      admin.exclusions.map((ex) =>
        h("li", { class: "couple-row" },
          h("span", {}, nameOf.get(ex.participant_a) ?? "?", " ❤️ ", nameOf.get(ex.participant_b) ?? "?"),
          h("button", {
            type: "button", class: "btn btn-small btn-ghost btn-danger-text",
            onclick: () => act(() => call("admin.exclusion.remove", { a: ex.participant_a, b: ex.participant_b }), t.coupleRemoved),
          }, t.remove)))),
    form);
}

function createEventForm(defaultYear: number, label: string) {
  const form = h("form", { class: "row row-wrap event-form" },
    h("label", { class: "field field-inline" },
      h("span", {}, t.eventYear),
      h("input", { name: "year", type: "number", min: 2000, max: 2100, required: true, value: defaultYear })),
    h("button", { type: "submit", class: "btn btn-primary" }, label));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const year = Number(formValues(form).year);
    drawNotice = null;
    act(() => call("admin.event.create", { year }), t.eventCreated(year));
  });
  return form;
}

function drawCard(s: State, admin: AdminData) {
  const ev = s.event;
  const thisYear = new Date().getFullYear();
  const activeCount = admin.participants.filter((p) => p.active).length;

  if (!ev) {
    return h("section", { class: "card" },
      h("h3", {}, t.event),
      h("p", {}, t.noEvent),
      createEventForm(thisYear, t.createEvent(thisYear)));
  }

  if (ev.status === "open") {
    return h("section", { class: "card" },
      h("h3", {}, t.event, " · ", t.christmas(ev.year)),
      h("p", {}, t.eventOpen),
      h("p", { class: "hint" }, t.activeCount(activeCount)),
      h("button", {
        type: "button", class: "btn btn-primary btn-big",
        onclick: async () => {
          const ok = await confirmDialog({
            title: t.confirmDrawTitle, message: t.confirmDraw(activeCount), confirmLabel: t.runDraw,
          });
          if (!ok) return;
          let relaxed = false;
          const done = await act(async () => {
            relaxed = (await call<{ relaxedRepeatRule: boolean }>("admin.draw", { eventId: ev.id })).relaxedRepeatRule;
          });
          if (done) {
            drawNotice = relaxed ? t.drawRelaxed : null;
            toast(t.drawDone);
            render();
          }
        },
      }, t.runDraw));
  }

  return h("section", { class: "card" },
    h("h3", {}, t.event, " · ", t.christmas(ev.year)),
    h("p", { class: "drawn-on" }, "✅ ", t.drawnOn(formatDate(ev.drawnAt!))),
    drawNotice && h("p", { class: "warning" }, drawNotice),
    h("p", { class: "hint" }, t.drawSecret),
    h("button", {
      type: "button", class: "btn btn-ghost btn-danger-text",
      onclick: async () => {
        const ok = await confirmDialog({
          title: t.confirmResetTitle, message: t.confirmReset, confirmLabel: t.resetDraw,
          danger: true, requireWord: t.confirmResetWord,
        });
        if (ok) {
          drawNotice = null;
          act(() => call("admin.reset", { eventId: ev.id }), t.resetDone);
        }
      },
    }, t.resetDraw),
    ev.year < thisYear && h("div", { class: "next-year" },
      h("p", { class: "hint" }, t.newYearHint(thisYear)),
      createEventForm(thisYear, t.createEvent(thisYear))));
}

// ---------------------------------------------------------------------------
// Boot

async function boot() {
  if (!isConfigured) {
    showMessage(t.appTitle, t.configMissing);
    return;
  }
  if (!readToken()) {
    showMessage(t.noLinkTitle, t.noLinkBody);
    return;
  }
  root.replaceChildren(h("p", { class: "loading" }, t.loading));
  try {
    await load();
    render();
  } catch (err) {
    handleError(err);
    if (!state && !(err instanceof ApiError && err.code === "invalid_token")) {
      showMessage(t.appTitle, errorMessage(err instanceof ApiError ? err.code : "server_error"));
    }
  }
}

// Opening a different personal link in the same tab switches person.
window.addEventListener("hashchange", () => {
  if (new URLSearchParams(location.hash.slice(1)).get("t")) {
    state = null;
    boot();
  }
});

boot();
