import { asyncHandler, Errors } from '../../middleware/error';
import { ApiResponse } from '../../utils/response';
import { requireUser } from '../../middleware/auth';
import * as service from './certificates.service';
import type { CertificateActor } from './certificates.service';
import type { QueryCertificateDto } from './certificates.schema';

/** The verified token, reduced to what decides a certificate's reach. */
function actor(req: Parameters<typeof requireUser>[0]): CertificateActor {
  const user = requireUser(req);
  return { sub: user.sub, roleCode: user.roleCode, unitId: user.unitId };
}

export const listCertificates = asyncHandler(async (req, res) => {
  const query = (res.locals.validatedQuery ?? req.query) as QueryCertificateDto;
  const result = await service.getCertificates(query, actor(req));
  res.json({ success: true, ...result });
});

export const getCertificate = asyncHandler(async (req, res) => {
  const certificate = await service.getCertificateById(req.params.id, actor(req));
  if (!certificate) throw Errors.notFound('Certificate');
  res.json(ApiResponse.success(certificate));
});

export const getStudentCertificates = asyncHandler(async (req, res) => {
  const result = await service.getStudentCertificates(req.params.studentId, actor(req));
  res.json({ success: true, ...result });
});

export const verifyCertificate = asyncHandler(async (req, res) => {
  const result = await service.verifyCertificate(req.params.code);
  res.json(ApiResponse.success(result));
});

export const createCertificate = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const certificate = await service.createCertificate(req.body, user.sub, actor(req));
  res.status(201).json(ApiResponse.success(certificate, 'Certificate created'));
});

export const updateCertificate = asyncHandler(async (req, res) => {
  const certificate = await service.updateCertificate(req.params.id, req.body, actor(req));
  res.json(ApiResponse.success(certificate, 'Certificate updated'));
});

export const deleteCertificate = asyncHandler(async (req, res) => {
  await service.deleteCertificate(req.params.id, actor(req));
  res.json(ApiResponse.success(null, 'Certificate deleted'));
});

export const generateCertificatePdf = asyncHandler(async (req, res) => {
  const certificate = await service.generateCertificatePdf(req.params.id, actor(req));
  res.json(ApiResponse.success(certificate, 'Certificate PDF generated'));
});

/**
 * The download route answers with the PDF itself, so the caller's
 * `responseType: 'blob'` receives bytes rather than a JSON envelope. When no
 * PDF has been generated yet, one is produced first — the button that reaches
 * this route is "Download PDF", and a 404 for a certificate that simply has not
 * been rendered yet is a dead end for the user.
 */
export const downloadCertificate = asyncHandler(async (req, res) => {
  const certificate = await service.getCertificateById(req.params.id, actor(req));
  if (!certificate) throw Errors.notFound('Certificate');

  // The bytes are rendered here (and stored) rather than re-read from disk, so
  // the download never depends on a file a redeploy could have removed.
  const { certificate: rendered, buffer } = await service.renderCertificatePdf(
    req.params.id,
    actor(req)
  );
  await service.incrementDownloadCount(req.params.id);

  const filename = `sertifikat-${rendered.certificateNumber.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});
