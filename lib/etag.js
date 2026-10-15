// HTTP delivery can quote ETags and add W/ after compression. Blob management
// operations expect the opaque token returned by put/head/list instead.
export function canonicalEtag(value) {
 if (typeof value !== 'string') return '';
 return value.replace(/^W\//,'').replace(/^"(.*)"$/, '$1');
}
export function sameEtag(a,b) {
 const first=canonicalEtag(a),second=canonicalEtag(b);
 return !!first && !!second && first===second;
}
