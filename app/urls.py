from django.urls import path
from .views import home, ConfigView, SitesGeoJSON, SitePDFEmbed

urlpatterns = [
    path('', home, name='home'),
    path('api/config/', ConfigView.as_view(), name='api-config'),
    path('api/sites/', SitesGeoJSON.as_view(), name='api-sites'),
    path("pdf/site/<int:pk>/", SitePDFEmbed.as_view(), name="site-pdf"), 
]
