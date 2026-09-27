/** アプリのアイコン（public/icon.svg）。GitHub Pages ではサブパスで配信されるため BASE_URL から組み立てる */
export default function AppIcon({ size }: { size: number }) {
  return <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={size} height={size} style={{ display: 'block' }} />
}
