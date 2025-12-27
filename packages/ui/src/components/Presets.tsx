import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Link, Trash2, Info, Download, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Store, Search, Package } from "lucide-react";
import { Toast } from "@/components/ui/toast";

interface PresetMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  ccwVersion?: string;
  source?: string;
  sourceType?: 'local' | 'gist' | 'registry';
  checksum?: string;
  installed: boolean;
}

interface PresetDetail extends PresetMetadata {
  config?: any;
  requiredInputs?: Array<{ field: string; prompt?: string; placeholder?: string }>;
}

interface MarketPreset {
  id: string;
  name: string;
  author?: string;
  description?: string;
  repo: string;
}

export function Presets() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [presets, setPresets] = useState<PresetMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [marketDialogOpen, setMarketDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetDetail | null>(null);
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [installMethod, setInstallMethod] = useState<'file' | 'url'>('file');
  const [installUrl, setInstallUrl] = useState('');
  const [installFile, setInstallFile] = useState<File | null>(null);
  const [installName, setInstallName] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [marketSearch, setMarketSearch] = useState('');
  const [marketPresets, setMarketPresets] = useState<MarketPreset[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [installingFromMarket, setInstallingFromMarket] = useState<string | null>(null);

  // 返回上一页
  const handleGoBack = () => {
    navigate('/dashboard');
  };

  // 加载市场预设
  const loadMarketPresets = async () => {
    setMarketLoading(true);
    try {
      const response = await api.getMarketPresets();
      setMarketPresets(response.presets || []);
    } catch (error) {
      console.error('Failed to load market presets:', error);
      setToast({ message: t('presets.load_market_failed'), type: 'error' });
    } finally {
      setMarketLoading(false);
    }
  };

  // 从市场安装预设
  const handleInstallFromMarket = async (preset: MarketPreset) => {
    try {
      setInstallingFromMarket(preset.id);
      await api.installPresetFromGitHub(preset.repo, preset.name);
      setToast({ message: t('presets.preset_installed'), type: 'success' });
      setMarketDialogOpen(false);
      await loadPresets();
    } catch (error: any) {
      console.error('Failed to install preset:', error);
      setToast({ message: t('presets.preset_install_failed', { error: error.message }), type: 'error' });
    } finally {
      setInstallingFromMarket(null);
    }
  };

  // 打开市场对话框时加载预设
  useEffect(() => {
    if (marketDialogOpen && marketPresets.length === 0) {
      loadMarketPresets();
    }
  }, [marketDialogOpen]);

  // 过滤市场预设
  const filteredMarketPresets = marketPresets.filter(preset =>
    preset.name.toLowerCase().includes(marketSearch.toLowerCase()) ||
    preset.description?.toLowerCase().includes(marketSearch.toLowerCase()) ||
    preset.author?.toLowerCase().includes(marketSearch.toLowerCase())
  );

  // 加载预设列表
  const loadPresets = async () => {
    try {
      setLoading(true);
      const response = await api.getPresets();
      setPresets(response.presets || []);
    } catch (error) {
      console.error('Failed to load presets:', error);
      setToast({ message: t('presets.load_presets_failed'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresets();
  }, []);

  // 查看预设详情
  const handleViewDetail = async (preset: PresetMetadata) => {
    try {
      const detail = await api.getPreset(preset.id);
      setSelectedPreset({ ...preset, ...detail });
      setDetailDialogOpen(true);

      // 初始化 secrets
      if (detail.requiredInputs) {
        const initialSecrets: Record<string, string> = {};
        for (const input of detail.requiredInputs) {
          initialSecrets[input.field] = '';
        }
        setSecrets(initialSecrets);
      }
    } catch (error) {
      console.error('Failed to load preset details:', error);
      setToast({ message: t('presets.load_preset_details_failed'), type: 'error' });
    }
  };

  // 安装预设
  const handleInstall = async () => {
    try {
      setIsInstalling(true);

      if (installMethod === 'url' && installUrl) {
        await api.installPresetFromUrl(installUrl, installName || undefined);
      } else if (installMethod === 'file' && installFile) {
        await api.uploadPresetFile(installFile, installName || undefined);
      } else {
        setToast({ message: t('presets.please_provide_file_or_url'), type: 'warning' });
        return;
      }

      setToast({ message: t('presets.preset_installed'), type: 'success' });
      setInstallDialogOpen(false);
      setInstallUrl('');
      setInstallFile(null);
      setInstallName('');
      await loadPresets();
    } catch (error: any) {
      console.error('Failed to install preset:', error);
      setToast({ message: t('presets.preset_install_failed', { error: error.message }), type: 'error' });
    } finally {
      setIsInstalling(false);
    }
  };

  // 应用预设（配置敏感信息）
  const handleApplyPreset = async () => {
    try {
      setIsApplying(true);

      // 验证所有必填项都已填写
      if (selectedPreset?.requiredInputs) {
        for (const input of selectedPreset.requiredInputs) {
          if (!secrets[input.field] || secrets[input.field].trim() === '') {
            setToast({ message: t('presets.please_fill_field', { field: input.field }), type: 'warning' });
            return;
          }
        }
      }

      await api.applyPreset(selectedPreset!.name, secrets);
      setToast({ message: t('presets.preset_applied'), type: 'success' });
      setDetailDialogOpen(false);
      setSecrets({});
    } catch (error: any) {
      console.error('Failed to apply preset:', error);
      setToast({ message: t('presets.preset_apply_failed', { error: error.message }), type: 'error' });
    } finally {
      setIsApplying(false);
    }
  };

  // 删除预设
  const handleDelete = async () => {
    if (!presetToDelete) return;

    try {
      await api.deletePreset(presetToDelete);
      setToast({ message: t('presets.preset_deleted'), type: 'success' });
      setDeleteDialogOpen(false);
      setPresetToDelete(null);
      await loadPresets();
    } catch (error: any) {
      console.error('Failed to delete preset:', error);
      setToast({ message: t('presets.preset_delete_failed', { error: error.message }), type: 'error' });
    }
  };

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b p-4">
        <Button variant="ghost" size="icon" onClick={handleGoBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <CardTitle className="text-lg">{t('presets.title')} <span className="text-sm font-normal text-gray-500">({presets.length})</span></CardTitle>
        <Button variant="ghost" size="icon" onClick={() => setMarketDialogOpen(true)}>
          <Store className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : presets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Download className="h-12 w-12 mb-4 opacity-50" />
            <p>{t('presets.no_presets')}</p>
            <p className="text-sm">{t('presets.no_presets_hint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {presets.map((preset) => (
              <div
                key={preset.name}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{preset.name}</h3>
                    <span className="text-xs text-gray-500">v{preset.version}</span>
                  </div>
                  {preset.description && (
                    <p className="text-sm text-gray-600 mt-1">{preset.description}</p>
                  )}
                  {preset.author && (
                    <p className="text-xs text-gray-500 mt-1">by {preset.author}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewDetail(preset)}
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setPresetToDelete(preset.id);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Install Dialog */}
      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('presets.install_dialog_title')}</DialogTitle>
            <DialogDescription>
              {t('presets.install_dialog_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button
                variant={installMethod === 'file' ? 'default' : 'outline'}
                onClick={() => setInstallMethod('file')}
                className="flex-1"
              >
                <Upload className="mr-2 h-4 w-4" />
                {t('presets.upload_file')}
              </Button>
              <Button
                variant={installMethod === 'url' ? 'default' : 'outline'}
                onClick={() => setInstallMethod('url')}
                className="flex-1"
              >
                <Link className="mr-2 h-4 w-4" />
                {t('presets.from_url')}
              </Button>
            </div>

            {installMethod === 'file' ? (
              <div className="space-y-2">
                <Label htmlFor="preset-file">{t('presets.preset_file')}</Label>
                <Input
                  id="preset-file"
                  type="file"
                  accept=".ccrsets"
                  onChange={(e) => setInstallFile(e.target.files?.[0] || null)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="preset-url">{t('presets.preset_url')}</Label>
                <Input
                  id="preset-url"
                  type="url"
                  placeholder={t('presets.preset_url_placeholder')}
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="preset-name">{t('presets.preset_name')}</Label>
              <Input
                id="preset-name"
                placeholder={t('presets.preset_name_placeholder')}
                value={installName}
                onChange={(e) => setInstallName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallDialogOpen(false)}>
              {t('presets.close')}
            </Button>
            <Button onClick={handleInstall} disabled={isInstalling}>
              {isInstalling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('presets.installing')}
                </>
              ) : (
                t('presets.install')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedPreset?.name}
              {selectedPreset?.version && (
                <span className="text-sm font-normal text-gray-500">v{selectedPreset.version}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {selectedPreset?.description && (
              <p className="text-gray-700 mb-4">{selectedPreset.description}</p>
            )}

            {selectedPreset?.author && (
              <p className="text-sm text-gray-600 mb-1">
                <strong>Author:</strong> {selectedPreset.author}
              </p>
            )}

            {selectedPreset?.homepage && (
              <p className="text-sm text-gray-600 mb-1">
                <strong>Homepage:</strong> <a href={selectedPreset.homepage} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{selectedPreset.homepage}</a>
              </p>
            )}

            {selectedPreset?.repository && (
              <p className="text-sm text-gray-600 mb-1">
                <strong>Repository:</strong> <a href={selectedPreset.repository} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{selectedPreset.repository}</a>
              </p>
            )}

            {selectedPreset?.keywords && selectedPreset.keywords.length > 0 && (
              <div className="mt-4">
                <strong>Keywords:</strong>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedPreset.keywords.map((keyword) => (
                    <span key={keyword} className="px-2 py-1 bg-gray-100 rounded text-sm">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedPreset?.requiredInputs && selectedPreset.requiredInputs.length > 0 && (
              <div className="mt-6 space-y-4">
                <h4 className="font-medium text-sm">{t('presets.required_information')}</h4>
                {selectedPreset.requiredInputs.map((input) => (
                  <div key={input.field} className="space-y-2">
                    <Label htmlFor={`secret-${input.field}`}>
                      {input.prompt || input.field}
                    </Label>
                    <Input
                      id={`secret-${input.field}`}
                      type="password"
                      placeholder={input.placeholder || t('presets.please_fill_field', { field: input.field })}
                      value={secrets[input.field] || ''}
                      onChange={(e) => setSecrets({ ...secrets, [input.field]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              {t('presets.close')}
            </Button>
            {selectedPreset?.requiredInputs && selectedPreset.requiredInputs.length > 0 && (
              <Button onClick={handleApplyPreset} disabled={isApplying}>
                {isApplying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('presets.applying')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('presets.apply')}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Market Presets Dialog */}
      <Dialog open={marketDialogOpen} onOpenChange={setMarketDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {t('presets.market_title')}
            </DialogTitle>
            <DialogDescription>
              {t('presets.market_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 py-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('presets.search_placeholder')}
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {marketLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
              </div>
            ) : filteredMarketPresets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Package className="h-12 w-12 mb-4 opacity-50" />
                <p>{t('presets.no_presets_found')}</p>
                <p className="text-sm">{t('presets.no_presets_found_hint')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMarketPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{preset.name}</h3>
                        </div>
                        {preset.description && (
                          <p className="text-sm text-gray-600 mb-2">{preset.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          {preset.author && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{t('presets.by', { author: preset.author })}</span>
                              <a
                                href={`https://github.com/${preset.repo}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-600 hover:text-gray-900 transition-colors"
                                title={t('presets.github_repository')}
                              >
                                <i className="ri-github-fill text-xl"></i>
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => handleInstallFromMarket(preset)}
                        disabled={installingFromMarket === preset.id}
                        className="shrink-0"
                      >
                        {installingFromMarket === preset.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t('presets.installing')}
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            {t('presets.install')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('presets.delete_dialog_title')}</DialogTitle>
            <DialogDescription>
              {t('presets.delete_dialog_description', { name: presetToDelete })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('presets.close')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('presets.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </Card>
  );
}
