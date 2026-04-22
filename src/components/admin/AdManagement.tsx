import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Megaphone, 
  MapPin, 
  Eye, 
  MousePointer2, 
  Calendar as CalendarIcon,
  Trash2,
  Edit,
  MoreVertical,
  CircleDollarSign,
  TrendingUp,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { 
  getActiveAds, 
  getAllAdsRealtime,
  deleteAdvertisement, 
  updateAdvertisement, 
  createAdvertisement,
  type Advertisement 
} from '../../utils/firebase/firestore';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { Timestamp } from 'firebase/firestore';
import { auth } from '../../utils/firebase/client';

export function AdManagement() {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newAd, setNewAd] = useState({
    title: '',
    brandName: '',
    description: '',
    imageUrl: '',
    ctaLink: '',
    ctaText: 'Learn More',
    type: 'in-campus' as 'in-campus' | 'out-campus',
    lat: 12.969728,
    lng: 79.160694,
    radius: 500,
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    const unsubscribe = getAllAdsRealtime((data) => {
      setAds(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAd.title || !newAd.brandName || !newAd.startDate || !newAd.endDate) return;

    const adData: Omit<Advertisement, 'id' | 'createdAt' | 'stats'> = {
      title: newAd.title,
      brandName: newAd.brandName,
      description: newAd.description,
      imageUrl: newAd.imageUrl,
      ctaLink: newAd.ctaLink,
      ctaText: newAd.ctaText,
      type: newAd.type,
      location: {
        lat: Number(newAd.lat),
        lng: Number(newAd.lng),
        name: newAd.type === 'in-campus' ? 'On Campus' : 'Off Campus'
      },
      radius: Number(newAd.radius),
      startDate: Timestamp.fromDate(new Date(newAd.startDate)),
      endDate: Timestamp.fromDate(new Date(newAd.endDate)),
      status: 'active',
      createdBy: auth.currentUser?.uid || 'admin'
    };

    await createAdvertisement(adData);
    setIsAddDialogOpen(false);
    setNewAd({
      title: '', brandName: '', description: '', imageUrl: '', ctaLink: '', ctaText: 'Learn More',
      type: 'in-campus', lat: 12.969728, lng: 79.160694, radius: 500, startDate: '', endDate: ''
    });
  };

  const handleDelete = async (adId: string) => {
    if (window.confirm('Delete this advertisement campaign?')) {
      await deleteAdvertisement(adId);
      setAds(ads.filter(a => a.id !== adId));
    }
  };

  const handleToggleStatus = async (ad: Advertisement) => {
    const newStatus = ad.status === 'active' ? 'inactive' : 'active';
    await updateAdvertisement(ad.id!, { status: newStatus });
    setAds(ads.map(a => a.id === ad.id ? { ...a, status: newStatus } : a));
  };

  const filteredAds = ads.filter(a => 
    a.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.brandName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input 
            className="pl-10 bg-white border-slate-200 rounded-xl w-full" 
            placeholder="Search campaigns..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2 bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-100 w-full sm:w-auto">
              <Plus size={18} />
              Launch New Ad
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Launch New Advertisement</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAd} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Campaign Title</Label>
                  <Input id="title" value={newAd.title} onChange={e => setNewAd({...newAd, title: e.target.value})} placeholder="Summer Sale" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand Name</Label>
                  <Input id="brand" value={newAd.brandName} onChange={e => setNewAd({...newAd, brandName: e.target.value})} placeholder="Campus Cafe" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Input id="desc" value={newAd.description} onChange={e => setNewAd({...newAd, description: e.target.value})} placeholder="Get 20% off all coffees" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ctaLink">CTA Link</Label>
                  <Input id="ctaLink" value={newAd.ctaLink} onChange={e => setNewAd({...newAd, ctaLink: e.target.value})} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ctaText">CTA Button Text</Label>
                  <Input id="ctaText" value={newAd.ctaText} onChange={e => setNewAd({...newAd, ctaText: e.target.value})} placeholder="Order Now" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Start Date</Label>
                  <Input id="start" type="date" value={newAd.startDate} onChange={e => setNewAd({...newAd, startDate: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">End Date</Label>
                  <Input id="end" type="date" value={newAd.endDate} onChange={e => setNewAd({...newAd, endDate: e.target.value})} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="image">Image URL</Label>
                <Input id="image" value={newAd.imageUrl} onChange={e => setNewAd({...newAd, imageUrl: e.target.value})} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <select 
                    id="type" 
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    value={newAd.type}
                    onChange={e => setNewAd({...newAd, type: e.target.value as any})}
                  >
                    <option value="in-campus">In Campus</option>
                    <option value="out-campus">Out Campus</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radius">Radius (m)</Label>
                  <Input id="radius" type="number" value={newAd.radius} onChange={e => setNewAd({...newAd, radius: Number(e.target.value)})} />
                </div>
              </div>
              <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 rounded-xl">Launch Campaign</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredAds.map((ad) => (
          <Card key={ad.id} className="border-none shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="flex flex-col lg:flex-row lg:items-center p-4 gap-4 lg:gap-6">
                <div className="flex items-center gap-4 flex-1">
                  {/* Ad Banner Preview */}
                  <div className="w-20 h-14 sm:w-32 sm:h-20 rounded-xl bg-slate-100 shrink-0 overflow-hidden relative border border-slate-50">
                    {ad.imageUrl ? (
                      <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <Megaphone size={20} />
                      </div>
                    )}
                    <div className="absolute top-1 right-1">
                      <Badge className={`text-[8px] px-1 py-0 border-none ${
                        ad.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}>
                        {ad.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">{ad.title}</h3>
                      <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-slate-200 px-1 py-0">
                        {ad.type}
                      </Badge>
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-sky-600 mb-1.5">{ad.brandName}</p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-[10px] sm:text-xs text-slate-500">
                      <span className="flex items-center gap-1"><MapPin size={12} /> {ad.location.name || 'Map Placement'}</span>
                      <span className="flex items-center gap-1"><CalendarIcon size={12} /> {ad.startDate.toDate().toLocaleDateString()} - {ad.endDate.toDate().toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between lg:justify-end gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6">
                  {/* Analytics Snapshot */}
                  <div className="flex gap-4 sm:gap-8">
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Impressions</p>
                      <div className="flex items-center gap-1 justify-center">
                        <Eye size={12} className="text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">{ad.stats.impressions.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Clicks</p>
                      <div className="flex items-center gap-1 justify-center">
                        <MousePointer2 size={12} className="text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">{ad.stats.clicks.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">CTR</p>
                      <p className="text-sm font-bold text-emerald-600">
                        {ad.stats.impressions > 0 
                          ? ((ad.stats.clicks / ad.stats.impressions) * 100).toFixed(1) 
                          : '0'}%
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                          <MoreVertical size={18} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 rounded-xl border-slate-100 shadow-xl">
                        <DropdownMenuItem onClick={() => handleToggleStatus(ad)}>
                          <TrendingUp size={16} className="mr-2" /> 
                          {ad.status === 'active' ? 'Deactivate Campaign' : 'Activate Campaign'}
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <BarChart3 size={16} className="mr-2" /> View Detailed Analytics
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <MapPin size={16} className="mr-2" /> Edit Map Placement
                        </DropdownMenuItem>
                        <div className="h-px bg-slate-100 my-1" />
                        <DropdownMenuItem className="text-sky-600">
                          <Edit size={16} className="mr-2" /> Edit Content
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-rose-600" onClick={() => handleDelete(ad.id!)}>
                          <Trash2 size={16} className="mr-2" /> Delete Campaign
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredAds.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <Megaphone size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No active campaigns</h3>
            <p className="text-slate-500">Create your first map-based advertisement to start monetizing</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BarChart3(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
