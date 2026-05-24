export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', textAlign: 'center', paddingTop: '6rem' }}>
        <p style={{ fontSize: '4rem', fontWeight: 'bold', color: '#ccc', margin: 0 }}>404</p>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Wrong Turn!</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          Oops, looks like you took the wrong turn. This route doesn&apos;t exist.
        </p>
        <a href="/" style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '6px', textDecoration: 'none', color: 'inherit' }}>
          Back to the peloton
        </a>
      </body>
    </html>
  )
}
