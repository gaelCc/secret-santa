// All user-facing text lives here, so the wording is easy to tweak.

export const t = {
  appTitle: "Secret Santa di famiglia",
  loading: "Un attimo, sto aprendo i regali…",

  // Access
  noLinkTitle: "Ciao! 🎄",
  noLinkBody:
    "Per entrare ti serve il tuo link personale. Se non ce l'hai o l'hai perso, chiedilo a chi organizza: te ne manda uno nuovo in un attimo.",
  badLinkTitle: "Questo link non funziona più",
  badLinkBody:
    "Forse ne è stato creato uno nuovo per te. Chiedi a chi organizza di rimandartelo su WhatsApp.",
  configMissing: "L'app non è ancora configurata (manca l'indirizzo di Supabase).",

  hello: (name: string) => `Ciao ${name}! 🎅`,

  // Draw status
  youBuyFor: "Quest'anno fai il regalo a",
  seeTheirList: "Guarda la sua lista",
  noDrawYet: (year: number) =>
    `Il sorteggio per il Natale ${year} non è ancora stato fatto. Intanto aggiorna la tua lista dei desideri!`,
  noEventYet: "Il sorteggio non è ancora stato fatto. Intanto aggiorna la tua lista dei desideri!",
  drawnNoAssignment:
    "Il sorteggio è stato fatto, ma tu non eri nell'elenco. Chiedi a chi organizza!",

  // My wishlist
  myList: "La mia lista dei desideri",
  myListHint: "Scrivi cosa ti piacerebbe ricevere. Tutta la famiglia può leggere la tua lista.",
  myListEmpty: "La tua lista è ancora vuota. Aggiungi il primo desiderio!",
  itemTitle: "Cosa desideri?",
  itemTitlePlaceholder: "Es. un libro di ricette",
  itemUrl: "Link (facoltativo)",
  itemUrlPlaceholder: "https://…",
  itemNotes: "Note (facoltative)",
  itemNotesPlaceholder: "Taglia, colore, dove trovarlo…",
  addItem: "Aggiungi",
  save: "Salva",
  cancel: "Annulla",
  edit: "Modifica",
  delete: "Elimina",
  moveUp: "Sposta su",
  moveDown: "Sposta giù",
  openLink: "Apri il link",
  confirmDeleteItem: (title: string) => `Vuoi davvero togliere “${title}” dalla tua lista?`,
  itemAdded: "Aggiunto alla lista! ✨",
  itemSaved: "Modifiche salvate.",
  itemDeleted: "Tolto dalla lista.",

  // Family lists
  familyLists: "Le liste della famiglia",
  emptyList: "Non ha ancora scritto niente.",
  yourReceiverBadge: "🎁 Fai il regalo a questa persona",
  nobodyElse: "Non ci sono ancora altri partecipanti.",

  // Admin
  adminTitle: "Organizzazione",
  adminHint: "Questa sezione la vedi solo tu.",

  participants: "Partecipanti",
  addPerson: "Aggiungi una persona",
  personName: "Nome",
  personPhone: "Cellulare WhatsApp (facoltativo)",
  personPhoneHint: "Con il prefisso internazionale, es. +39 333 123 4567",
  add: "Aggiungi",
  adminBadge: "organizzatore",
  inactiveBadge: "disattivato",
  deactivate: "Disattiva",
  reactivate: "Riattiva",
  confirmDeactivate: (name: string) =>
    `Disattivare ${name}? Non parteciperà al sorteggio e il suo link smetterà di funzionare. Potrai riattivarlo quando vuoi.`,
  personAdded: (name: string) => `${name} è nella lista! Ora invia il suo link su WhatsApp.`,
  personSaved: "Dati aggiornati.",
  lateJoinerWarning:
    "Il sorteggio di quest'anno è già stato fatto: chi aggiungi ora non è incluso. Se vuoi includerlo, annulla il sorteggio e rifallo.",

  newLink: "Nuovo link",
  confirmRegenerate: (name: string) =>
    `Creare un nuovo link per ${name}? Quello vecchio smetterà subito di funzionare.`,
  confirmRegenerateSelf:
    "Creare un nuovo link per te? Quello che stai usando smetterà di funzionare: salva subito quello nuovo!",
  sendWhatsApp: "Invia su WhatsApp",
  sendWhatsAppNeedsLink: (name: string) =>
    `Per mandare il link a ${name} devo crearne uno nuovo (salvo solo una versione cifrata, quindi quello vecchio non posso rivederlo). Il vecchio smetterà di funzionare. Procedo?`,
  copyLink: "Copia",
  linkCopied: "Link copiato!",
  freshLinkTitle: (name: string) => `Link personale di ${name}`,
  freshLinkWarning:
    "⚠️ Questo link lo vedi solo adesso: non viene salvato da nessuna parte. Mandalo subito! Se lo perdi, potrai sempre crearne uno nuovo.",
  hideLink: "Fatto, nascondi",
  waMessage: (name: string, link: string) =>
    `Ciao ${name}! 🎄 Ecco il tuo link personale per il Secret Santa di famiglia:\n${link}\n\nLì puoi scrivere la tua lista dei desideri, vedere quelle degli altri e, dopo il sorteggio, scoprire a chi fai il regalo. 🎁 Non girarlo a nessuno: è solo tuo!`,

  couples: "Coppie",
  couplesHint: "Le persone in coppia non si estraggono mai a vicenda.",
  noCouples: "Nessuna coppia inserita.",
  addCouple: "Aggiungi coppia",
  choosePerson: "Scegli…",
  remove: "Rimuovi",
  coupleAdded: "Coppia aggiunta.",
  coupleRemoved: "Coppia rimossa.",

  event: "Sorteggio",
  christmas: (year: number) => `Natale ${year}`,
  noEvent: "Non hai ancora creato il Natale di quest'anno.",
  createEvent: (year: number) => `Crea il Natale ${year}`,
  eventYear: "Anno",
  eventCreated: (year: number) => `Natale ${year} creato! Quando sono tutti pronti, fai il sorteggio.`,
  eventOpen: "Il sorteggio non è ancora stato fatto.",
  activeCount: (n: number) => (n === 1 ? "1 partecipante attivo" : `${n} partecipanti attivi`),
  runDraw: "Fai il sorteggio 🎲",
  confirmDrawTitle: "Facciamo il sorteggio?",
  confirmDraw: (n: number) =>
    `Estraggo a sorte per ${n} persone. Ognuno vedrà solo a chi fa il regalo, e nemmeno tu potrai vedere gli abbinamenti degli altri.`,
  drawDone: "Sorteggio fatto! 🎉 Ora ognuno può scoprire a chi fa il regalo.",
  drawRelaxed:
    "Sorteggio fatto! 🎉 Attenzione però: non c'era modo di evitare che qualcuno avesse la stessa persona dell'anno scorso, quindi questa volta la regola “niente ripetizioni” non è stata rispettata per tutti.",
  drawnOn: (date: string) => `Sorteggio fatto il ${date}`,
  drawSecret: "Gli abbinamenti sono segreti: neanche tu puoi vederli. 🤫",
  resetDraw: "Annulla il sorteggio",
  confirmResetTitle: "Annullare il sorteggio?",
  confirmReset:
    "Tutti gli abbinamenti di quest'anno verranno cancellati e dovrai rifare il sorteggio. Se qualcuno ha già scoperto a chi fa il regalo, dovrete ricominciare da capo.",
  confirmResetWord: "ANNULLA",
  confirmResetPrompt: (word: string) => `Per confermare scrivi ${word}:`,
  resetDone: "Sorteggio annullato. Puoi rifarlo quando vuoi.",
  newYearHint: (year: number) => `Pronti per il prossimo anno? Crea il Natale ${year}.`,

  // Dialogs
  confirm: "Conferma",
  yesDelete: "Sì, elimina",
  yesProceed: "Sì, procedi",

  // Errors (keys match API error codes)
  errors: {
    invalid_token: "Questo link non funziona più. Chiedi a chi organizza di mandartene uno nuovo.",
    forbidden: "Questa cosa può farla solo chi organizza.",
    bad_request: "Qualcosa non torna nella richiesta. Ricarica la pagina e riprova.",
    title_required: "Scrivi almeno cosa desideri.",
    invalid_url: "Il link non sembra valido: deve iniziare con http:// o https://",
    too_long: "Il testo è un po' troppo lungo, prova ad accorciarlo.",
    too_many_items: "Hai già tanti desideri in lista! Togline qualcuno prima di aggiungerne altri.",
    not_found: "Non trovo quello che cerchi: forse è già stato eliminato.",
    invalid_name: "Scrivi un nome (massimo 60 caratteri).",
    invalid_phone: "Il numero non sembra valido. Usa il prefisso internazionale, es. +39 333 123 4567.",
    cannot_deactivate_admin: "Non puoi disattivare chi organizza.",
    same_person: "Scegli due persone diverse.",
    invalid_year: "L'anno non è valido.",
    event_exists: "Esiste già un Natale per quell'anno.",
    event_not_found: "Non trovo questo Natale. Ricarica la pagina.",
    event_already_drawn: "Il sorteggio è già stato fatto.",
    draw_too_few: "Servono almeno due partecipanti attivi per fare il sorteggio.",
    draw_impossible:
      "Non riesco a fare il sorteggio con queste regole: ci sono troppe coppie rispetto ai partecipanti. Aggiungi qualcuno o togli una coppia, poi riprova. Non ho salvato niente.",
    server_error: "Ops, qualcosa è andato storto. Riprova tra poco.",
    network: "Non riesco a collegarmi. Controlla la connessione e riprova.",
  } as Record<string, string>,
};

export const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "25 dicembre 2026" */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function errorMessage(code: string): string {
  return t.errors[code] ?? t.errors.server_error;
}
