import { asyncHandler, Errors } from '../../middleware/error';
import { ApiResponse } from '../../utils/response';
import { requireUser } from '../../middleware/auth';
import * as service from './certificates.service';
import type { QueryCertificateDto } from './certificates.schema';

export const listCertificates = asyncHandler(async (req, res) => {
  const query = (res.locals.validatedQuery ?? req.query) as QueryCertificateDto;
  const result = await service.getCertificates(query);
  res.json({ success: true, ...result });
});

export const getCertificate = asyncHandler(async (req, res) => {
  const certificate = await service.getCertificateById(req.params.id);
  if (!certificate) throw Errors.notFound('Certificate');
  res.json(ApiResponse.success(certificate));
});

export const getStudentCertificates = asyncHandler(async (req, res) => {
  const result = await service.getStudentCertificates(req.params.studentId);
  res.json({ success: true, ...result });
});

export const verifyCertificate = asyncHandler(async (req, res) => {
  const result = await service.verifyCertificate(req.params.code);
  res.json(ApiResponse.success(result));
});

export const createCertificate = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const certificate = await service.createCertificate(req.body, user.sub);
  res.status(201).json(ApiResponse.success(certificate, 'Certificate created'));
});

export const updateCertificate = asyncHandler(async (req, res) => {
  const certificate = await service.updateCertificate(req.params.id, req.body);
  res.json(ApiResponse.success(certificate, 'Certificate updated'));
});

export const deleteCertificate = asyncHandler(async (req, res) => {
  await service.deleteCertificate(req.params.id);
  res.json(ApiResponse.success(null, 'Certificate deleted'));
});

export const downloadCertificate = asyncHandler(async (req, res) => {
  const certificate = await service.getCertificateById(req.params.id);
  if (!certificate) throw Errors.notFound('Certificate');
  const updated = await service.incrementDownloadCount(req.params.id);
  res.json(
    ApiResponse.success({
      pdfUrl: certificate.pdfUrl,
      verificationUrl: certificate.verificationUrl,
      downloadCount: updated.downloadCount,
    }),
  );
});