// Legacy factories remain available only for historical regression tests.
// Every deployed legacy Notes endpoint terminates here before authentication/storage.
export default function retiredNotes(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(410).json({code:'NOTES_RETIRED', error:'Notes cũ đã ngừng hoạt động.', notesUrl:'https://hunghvt-notes.vercel.app/'});
}
