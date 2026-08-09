import { Nav, Footer } from '../../components/Chrome';
import { fragment } from '../../lib/fragment';

export const metadata = {
  title: 'Terms',
  description: 'Terms of use for the ux-lang website.',
};

export default async function Terms() {
  const body = await fragment('terms.html');
  return (
    <>
      <Nav current="/terms" />
      <main className="wrap" id="top" dangerouslySetInnerHTML={{ __html: body }} />
      <Footer />
    </>
  );
}
